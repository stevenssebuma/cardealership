import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildPoolConfig } from "../../config/databasePoolConfig.js";
import { createDatabaseAdapter } from "../../config/db.js";

const url = process.env.S17_NATIVE_TEST_DATABASE_URL;

test("native PostgreSQL schema, pg pool, parameter binding and transaction lifecycle", {
  skip: !url ? "Set S17_NATIVE_TEST_DATABASE_URL to an explicitly disposable local database." : false,
}, async (t) => {
  const environment = { NODE_ENV: "test", TEST_DATABASE_URL: url, DB_POOL_MAX: "3" };
  const config = buildPoolConfig(environment);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(config.host), "Test must use loopback");
  assert.match(config.database, /^cardealership_s17_test(?:_[a-z0-9]+)?$/);
  const bootstrap = new pg.Client(config);
  const db = createDatabaseAdapter({ environment });
  await bootstrap.connect();
  try {
    assert.equal((await bootstrap.query("SELECT current_database() AS name")).rows[0].name, config.database);
    assert.equal(Number((await bootstrap.query(
      "SELECT count(*) AS n FROM pg_catalog.pg_tables WHERE schemaname='public'",
    )).rows[0].n), 0, "Refusing to initialize a nonempty test database");
    const schema = await readFile(new URL("../../scripts/schema.sql", import.meta.url), "utf8");
    const fixture = await readFile(new URL("../fixtures/postgresqlSchemaAssertions.sql", import.meta.url), "utf8");
    await bootstrap.query(schema);
    await bootstrap.query(schema);
    await bootstrap.query(fixture);

    await t.test("native schema and fixture rollback", async () => {
      assert.equal(Number((await db.query("SELECT count(*) AS n FROM users")).rows[0].n), 0);
      assert.deepEqual(await db.verifyDatabaseConnection(), { connected: true });
    });

    await t.test("native placeholders and result contract", async () => {
      const result = await db.query("SELECT $1::int + $1::int AS total, $2::text AS label", [7, "literal"]);
      assert.equal(result.rowCount, 1);
      assert.deepEqual(result.rows, [{ total: 14, label: "literal" }]);
    });

    await t.test("connection-scoped commit and isolation across pooled clients", async () => {
      await db.withTransaction(async (tx) => {
        const before = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await tx.query("INSERT INTO users (name,email,password) VALUES ($1,$2,$3)", ["Fixture", "commit@example.invalid", "synthetic"]);
        assert.equal((await db.query("SELECT id FROM users WHERE email=$1", ["commit@example.invalid"])).rowCount, 0);
        assert.equal((await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid, before);
      });
      assert.equal((await db.query("SELECT id FROM users WHERE email=$1", ["commit@example.invalid"])).rowCount, 1);
    });

    await t.test("rollback and continued pool usability", async () => {
      await assert.rejects(db.withTransaction(async (tx) => {
        await tx.query("INSERT INTO users (name,email,password) VALUES ($1,$2,$3)", ["Fixture", "rollback@example.invalid", "synthetic"]);
        throw new Error("synthetic failure");
      }), /synthetic failure/);
      assert.equal((await db.query("SELECT id FROM users WHERE email=$1", ["rollback@example.invalid"])).rowCount, 0);
    });

    await t.test("aborted transactions cannot report success", async () => {
      await assert.rejects(db.withTransaction(async (tx) => {
        try {
          await tx.query("INSERT INTO users (name,email,password) VALUES ($1,$2,$3)", ["Fixture", "commit@example.invalid", "synthetic"]);
        } catch (error) {
          assert.equal(error.code, "23505");
        }
      }), /did not commit/);
    });

    await t.test("reject raw transaction control and multi-statements", async () => {
      await assert.rejects(db.query("-- comment\nBEGIN"), /withTransaction/);
      await assert.rejects(db.query("SELECT 1; BEGIN"), (error) => error.code === "42601");
      assert.deepEqual(await db.verifyDatabaseConnection(), { connected: true });
    });
  } finally {
    await db.close();
    await bootstrap.end();
  }
});
