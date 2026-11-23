"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { createCarLookupRepository, createCarImageRepository } from "../../../repositories/bulkCarImageRepository.js";
import { createLocalImageStorage } from "../../../services/storage/localImageStorage.js";

test("canonical vehicle repository performs a parameterized numeric ID lookup", async () => {
  const queries = [];
  const repository = createCarLookupRepository({ async query(sql, values) {
    queries.push({ sql, values });
    return { rows: sql.includes("FROM cars c") ? [{ id: 7, price: "12500.50" }] : [] };
  } });
  assert.equal(await repository.findById("invalid"), null);
  assert.equal(queries.length, 0);
  assert.deepEqual(await repository.findById("7"), { id: 7, price: 12500.50 });
  assert.ok(queries.every(q => q.values[0] === 7));
});

test("canonical image repository saves URL and image type using PostgreSQL", async () => {
  let captured;
  const repository = createCarImageRepository({ async query(sql, values) {
    captured = { sql, values };
    return { rows: [{ id: 1, car_id: values[0], image_url: values[1], image_type: values[2] }] };
  } });
  const image = await repository.create({ carId: 7, url: "https://example.invalid/car.jpg", displayOrder: 1 });
  assert.match(captured.sql, /INSERT INTO car_images/);
  assert.deepEqual(captured.values, [7, "https://example.invalid/car.jpg", "general"]);
  assert.equal(image.carId, 7);
  await assert.rejects(repository.create({ carId: 0, url: "invalid" }), TypeError);
});

test("local storage writes and removes an image safely", async () => {
  const temporaryRoot = await fs.promises.mkdtemp(nodePath.join(os.tmpdir(), "sprint9-images-"));
  const storage = createLocalImageStorage({ storageRoot: temporaryRoot, publicPrefix: "/test-images" });
  const result = await storage.store({
    vehicleId: "vehicle-1",
    clientFileId: "file-1",
    fileName: "../../unsafe vehicle.jpg",
    buffer: Buffer.from("image-data")
  });
  const storedPath = storage.resolveStoragePath(result.storageKey);
  assert.equal(await fs.promises.readFile(storedPath, "utf8"), "image-data");
  assert.equal(result.url.startsWith("/test-images/vehicle-1/"), true);
  await storage.remove(result.storageKey);
  await assert.rejects(fs.promises.access(storedPath));
  await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
});

test("local storage rejects escaped storage paths", () => {
  const storage = createLocalImageStorage({ storageRoot: nodePath.join(os.tmpdir(), "sprint9-safe-root") });
  assert.throws(() => storage.resolveStoragePath("../../outside.jpg"), /Unsafe storage path/);
});
