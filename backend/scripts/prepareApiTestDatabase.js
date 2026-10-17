import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "..");
const environmentPath = path.join(backendRoot, ".env.test");

dotenv.config({ path: environmentPath, override: true, quiet: true });
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required. Refusing to prepare a non-test database.",
  );
}

const databaseName = new URL(process.env.TEST_DATABASE_URL).pathname.replace(
  /^\//,
  "",
);
if (!/test/i.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL must name a database containing 'test'.");
}

const { default: db } = await import("../config/db.js");
const migrationPath = path.join(
  backendRoot,
  "sql",
  "20261014_api_booking_contract.sql",
);
const sql = await fs.readFile(migrationPath, "utf8");

for (const statement of sql
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean)) {
  await db.query(statement);
}

console.log("API booking test-database schema is ready.");
await db.pool.end();
