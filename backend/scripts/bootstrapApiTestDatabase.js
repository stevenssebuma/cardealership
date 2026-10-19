import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "..");
const environmentPath = path.join(backendRoot, ".env.test");
const schemaPath = path.join(backendRoot, "sql", "api-test-schema.sql");

const usingEmbeddedDatabase = process.env.API_TEST_EMBEDDED_RUNNER === "true";
if (!usingEmbeddedDatabase) {
  try {
    await fs.access(environmentPath);
  } catch {
    throw new Error(
      "backend/.env.test is required. Copy .env.test.example and configure a dedicated empty PostgreSQL test database.",
    );
  }
  dotenv.config({ path: environmentPath, override: true, quiet: true });
}
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Refusing to initialise a non-test database.",
  );
}

let databaseName;
try {
  databaseName = new URL(testUrl).pathname.replace(/^\//, "");
} catch {
  throw new Error(
    "TEST_DATABASE_URL must be a valid PostgreSQL connection URL.",
  );
}

if (!/test/i.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL must name a database containing 'test'.");
}

const { Pool } = pg;
const pool = new Pool({
  connectionString: testUrl,
  ssl:
    process.env.TEST_DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
});

try {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  if (rows[0].table_count > 0) {
    throw new Error(
      "The test database is not empty. Refusing to overwrite it. Create a new empty database or clear only a disposable test database before running test:api:setup.",
    );
  }

  const dump = await fs.readFile(schemaPath, "utf8");
  const sql = dump.replace(/^\\(?:un)?restrict[^\r\n]*(?:\r?\n)?/gm, "").trim();
  if (!sql) throw new Error("The API test schema snapshot is empty.");

  await pool.query("BEGIN");
  try {
    await pool.query(sql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  }
  console.log(`API test schema loaded into ${databaseName}.`);
} finally {
  await pool.end();
}
