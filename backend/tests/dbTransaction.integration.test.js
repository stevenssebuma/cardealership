// backend/tests/dbTransaction.integration.test.js
//
// Proves that transaction control and the statements inside it run on the same
// checked-out pool client. Regression guard for the old pattern of calling
// db.query("BEGIN") on the pool, which could commit or roll back on a
// different connection than the one doing the work.
//
// No database is required: the pool's connect() is replaced by a recording
// client, so the assertions are about the sequence of calls, not the rows.

import { beforeAll, describe, expect, test } from "@jest/globals";

let pool;
let withTransaction;
let createCar;

const CAR_PAYLOAD = {
  vin: "JTMHV05J204123456",
  make: "Toyota",
  model: "Land Cruiser",
  name: "Land Cruiser V8",
  type: "Luxury SUV",
  category: "luxury",
  year: 2023,
  price: 285000000,
  mileage: 0,
  color: "Pearl White",
  condition: "New",
  status: "Available",
  description: "Transaction test vehicle",
  power: "309 HP",
  engine: "4.5L V8",
  drive: "4WD",
  images: ["https://example.test/land-cruiser.jpg"],
};

function normalize(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createRecordingClient({ failOn } = {}) {
  const calls = [];
  let releaseCount = 0;

  return {
    calls,
    get releaseCount() {
      return releaseCount;
    },
    async query(sql, params = []) {
      const text = normalize(sql);
      calls.push(text);

      if (failOn && failOn.test(text)) {
        throw new Error("Simulated insert failure");
      }

      if (/^INSERT INTO cars/i.test(text)) {
        return { rows: [{ id: 4242 }], rowCount: 1, params };
      }

      return { rows: [], rowCount: 1 };
    },
    release() {
      releaseCount += 1;
    },
  };
}

beforeAll(async () => {
  const dbModule = await import("../config/db.js");
  const carsModel = await import("../models/carsModel.js");

  pool = dbModule.default;
  withTransaction = dbModule.withTransaction;
  createCar = carsModel.createCar;
});

describe("withTransaction", () => {
  test("runs BEGIN, the callback and COMMIT on one released client", async () => {
    const client = createRecordingClient();
    pool.connect = async () => client;

    const result = await withTransaction(async (checkedOutClient) => {
      expect(checkedOutClient).toBe(client);
      await checkedOutClient.query("SELECT 1");
      return "done";
    });

    expect(result).toBe("done");
    expect(client.calls[0]).toBe("BEGIN");
    expect(client.calls).toContain("SELECT 1");
    expect(client.calls[client.calls.length - 1]).toBe("COMMIT");
    expect(client.releaseCount).toBe(1);
  });

  test("rolls back, releases and rethrows when the callback fails", async () => {
    const client = createRecordingClient();
    pool.connect = async () => client;

    await expect(
      withTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(client.calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.releaseCount).toBe(1);
  });

  test("releases the client even when COMMIT itself fails", async () => {
    const client = createRecordingClient();
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      if (normalize(sql) === "COMMIT") throw new Error("commit failed");
      return originalQuery(sql, params);
    };
    pool.connect = async () => client;

    await expect(withTransaction(async (c) => c.query("SELECT 1"))).rejects.toThrow(
      "commit failed",
    );

    expect(client.releaseCount).toBe(1);
  });
});

describe("createCar writes", () => {
  test("inserts the vehicle, specs and images through a single connection", async () => {
    const client = createRecordingClient();
    let connections = 0;
    pool.connect = async () => {
      connections += 1;
      return client;
    };

    const carId = await createCar(CAR_PAYLOAD);

    expect(carId).toBe(4242);
    expect(connections).toBe(1);
    expect(client.calls.filter((text) => text === "BEGIN")).toHaveLength(1);
    expect(client.calls.filter((text) => text === "COMMIT")).toHaveLength(1);
    expect(client.calls.some((text) => /^INSERT INTO car_specs/i.test(text))).toBe(true);
    expect(client.calls.some((text) => /^INSERT INTO car_images/i.test(text))).toBe(true);
    expect(client.releaseCount).toBe(1);
  });

  test("rolls the vehicle back when a later insert fails", async () => {
    const client = createRecordingClient({ failOn: /^INSERT INTO car_specs/i });
    pool.connect = async () => client;

    await expect(createCar(CAR_PAYLOAD)).rejects.toThrow("Simulated insert failure");

    expect(client.calls).toContain("ROLLBACK");
    expect(client.calls).not.toContain("COMMIT");
    expect(client.releaseCount).toBe(1);
  });
});
