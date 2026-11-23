import assert from "node:assert/strict";
import test from "node:test";
import db from "../../config/db.js";
import { getAllCars, getCarById } from "../../models/carsModel.js";
import { buildPoolConfig } from "../../config/databasePoolConfig.js";

const requiredColumns = {
  cars: ["vin", "make", "model", "type", "category", "mileage", "color", "condition", "updated_at"],
  car_specs: ["car_id", "power", "engine", "drive"],
  car_images: ["car_id", "image_url", "image_type"],
};

test("car persistence uses PostgreSQL schema and native rows", {
  skip: process.env.NODE_ENV !== "test" || !process.env.TEST_DATABASE_URL
    ? "Explicit test database required" : false,
}, async () => {
  buildPoolConfig(process.env);
  try {
    for (const [tableName, expectedColumns] of Object.entries(requiredColumns)) {
      const result = await db.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`, [tableName]);
      const columns = result.rows.map((row) => row.column_name);
      for (const column of expectedColumns) assert.ok(columns.includes(column), `${tableName}.${column} missing`);
    }
    const cars = await getAllCars();
    assert.ok(Array.isArray(cars));
    for (const car of cars) assert.ok(Array.isArray(car.images));
    const firstCar = (await db.query("SELECT id FROM cars ORDER BY id LIMIT 1")).rows[0];
    if (firstCar) {
      const detail = await getCarById(firstCar.id);
      assert.equal(detail.car.id, firstCar.id);
      assert.ok(Array.isArray(detail.images));
    }
  } finally {
    await db.close();
  }
});
