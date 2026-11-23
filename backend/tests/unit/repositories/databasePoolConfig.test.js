import test from "node:test";
import assert from "node:assert/strict";
import { buildPoolConfig } from "../../../config/databasePoolConfig.js";

const local = "postgresql://fixture@127.0.0.1:5433/cardealership_test";

test("explicit PostgreSQL URL, native pool bounds and local TLS policy", () => {
  const config = buildPoolConfig({ DATABASE_URL: local, DB_POOL_MAX: "3" });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 5433);
  assert.equal(config.database, "cardealership_test");
  assert.equal(config.max, 3);
  assert.equal(config.ssl, false);
  assert.ok(config.statement_timeout > 0);
});

test("managed database URLs use verified TLS, including require", () => {
  const config = buildPoolConfig({
    DATABASE_URL: "postgresql://fixture:encoded%40value@db.example.invalid/test_db?sslmode=require",
  });
  assert.equal(config.password, "encoded@value");
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.throws(() => buildPoolConfig({
    DATABASE_URL: "postgresql://fixture@db.example.invalid/test_db?sslmode=disable",
  }), /TLS cannot be disabled/);
  assert.throws(() => buildPoolConfig({
    DATABASE_URL: "postgresql://fixture@db.example.invalid/test_db?sslmode=no-verify",
  }), /Unsupported PostgreSQL SSL mode/);
});

test("Render private TLS exception is explicit, runtime-scoped and rejects public hosts", () => {
  const environment = {
    RENDER: "true",
    DATABASE_NETWORK: "render-private",
    DATABASE_URL: "postgresql://fixture@dpg-stage-fixture-a/cardealership_stage?sslmode=require",
  };
  assert.deepEqual(buildPoolConfig(environment).ssl, { rejectUnauthorized: false });
  assert.throws(() => buildPoolConfig({ ...environment, RENDER: "" }), /requires a Render service/);
  assert.throws(() => buildPoolConfig({
    ...environment, DATABASE_URL: "postgresql://fixture@db.example.invalid/cardealership_stage",
  }), /internal database hostname/);
  assert.throws(() => buildPoolConfig({ ...environment, DATABASE_SSL: "false" }), /encrypted transport/);
  assert.deepEqual(buildPoolConfig({ DATABASE_URL: environment.DATABASE_URL }).ssl, { rejectUnauthorized: true });
});

test("missing and invalid targets fail without revealing the URL", () => {
  assert.throws(() => buildPoolConfig({}), /DATABASE_URL is required/);
  assert.throws(() => buildPoolConfig({
    DATABASE_URL: "mysql://fixture:secret@localhost/database",
  }), (error) => error.code === "DATABASE_CONFIG_INVALID" && !error.message.includes("secret"));
  assert.throws(() => buildPoolConfig({ DATABASE_URL: local + "?host=other" }), /unsupported connection option/);
  assert.throws(() => buildPoolConfig({ DATABASE_URL: local, DB_POOL_MAX: "0" }), /between/);
  assert.throws(() => buildPoolConfig({ DATABASE_URL: local, DB_CONNECT_TIMEOUT_MS: "abc" }), /integer/);
});

test("test mode requires a separate explicitly named test database", () => {
  assert.throws(() => buildPoolConfig({ NODE_ENV: "test", DATABASE_URL: local }), /TEST_DATABASE_URL is required/);
  assert.throws(() => buildPoolConfig({
    NODE_ENV: "test", TEST_DATABASE_URL: "postgresql://fixture@localhost/production",
  }), /dedicated test database/);
  assert.throws(() => buildPoolConfig({
    NODE_ENV: "test", TEST_DATABASE_URL: local,
    DATABASE_URL: "postgresql://other@localhost:5433/cardealership_test",
  }), /must not target/);
  assert.equal(buildPoolConfig({
    NODE_ENV: "test", TEST_DATABASE_URL: local,
    DATABASE_URL: "postgresql://fixture@127.0.0.1:5433/cardealership",
  }).database, "cardealership_test");
});

test("staging requires an exact dedicated database name and rejects production", () => {
  const environment={NODE_ENV:'staging',STAGING_DATABASE_NAME:'cardealership_s17_staging',
    DATABASE_URL:'postgresql://fixture@localhost/cardealership_s17_staging'};
  assert.equal(buildPoolConfig(environment).database,'cardealership_s17_staging');
  assert.throws(()=>buildPoolConfig({...environment,STAGING_DATABASE_NAME:'wrong'}),/dedicated staging database/);
  assert.throws(()=>buildPoolConfig({...environment,STAGING_DATABASE_NAME:'production_staging',DATABASE_URL:'postgresql://fixture@localhost/production_staging'}),/dedicated staging database/);
});
