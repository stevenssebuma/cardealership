// Execute with an explicitly installed PGlite module in an isolated directory.
// PGlite uses a real PostgreSQL WASM engine, not a network server or DATABASE_URL.
// The checked-in SQL fixture also runs against a disposable native PostgreSQL DB.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engineModule = process.env.S17_PGLITE_MODULE || "@electric-sql/pglite";
const { PGlite } = await import(engineModule);
const schema = await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8");
const fixture = await readFile(
  new URL("./fixtures/postgresqlSchemaAssertions.sql", import.meta.url),
  "utf8",
);

const expectedTables = [
  "bookings", "car_images", "car_specs", "cars",
  "exchange_rate_snapshots", "financing_leads", "users", "vehicle_spotlights",
];
const expectedIndexes = [
  "users_email_lower_unique_idx",
  "cars_vin_unique_idx",
  "uniq_booking",
  "financing_leads_active_status_created_idx",
  "exchange_rate_latest_snapshot",
  "exchange_rate_expiry_lookup",
  "vehicle_spotlights_score_idx", "vehicle_spotlights_unread_idx", "bookings_date_status_idx",
];

const db = new PGlite();
try {
  await db.exec(schema);
  const tables = (await db.query(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename",
  )).rows.map((row) => row.tablename);
  assert.deepEqual(tables, expectedTables);
  console.log("1/5 Fresh PostgreSQL DDL and eight expected tables: PASS");

  await db.exec(fixture);
  console.log("2/5 Relational constraints and persistence assertions: PASS");

  for (const table of expectedTables) {
    const result = await db.query(`SELECT count(*) AS n FROM public.${table}`);
    assert.equal(Number(result.rows[0].n), 0, `Fixture leakage: ${table}`);
  }
  console.log("3/5 Fixture rollback across all eight tables: PASS");

  await db.query(
    "INSERT INTO public.users (name,email,password) VALUES ($1,$2,$3)",
    ["S17 rerun fixture", "rerun@example.invalid", "synthetic-test-only"],
  );
  await db.exec(schema);
  const preserved = await db.query(
    "SELECT count(*) AS n FROM public.users WHERE email=$1",
    ["rerun@example.invalid"],
  );
  assert.equal(Number(preserved.rows[0].n), 1);
  console.log("4/5 Repeat schema execution preserves existing rows: PASS");

  const indexes = (await db.query(
    "SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname='public'",
  )).rows.map((row) => row.indexname);
  for (const name of expectedIndexes) {
    assert.ok(indexes.includes(name), `Missing index: ${name}`);
  }
  console.log("5/5 Required indexes: PASS");
  const result = await db.query("SELECT version() AS engine");
  console.log(result.rows[0].engine);
  console.log("P2 POSTGRESQL SCHEMA ENGINE VERIFICATION = 5/5 PASS");
} catch (error) {
  console.error("P2 schema verification failed:", error.code || "", error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
