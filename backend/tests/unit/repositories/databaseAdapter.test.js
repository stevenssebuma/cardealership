import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseAdapter } from "../../../config/db.js";

const environment = {
  NODE_ENV: "test",
  TEST_DATABASE_URL: "postgresql://fixture@localhost/cardealership_test",
};

function harness({ failRollback = false, commitCommand = "COMMIT" } = {}) {
  const events = [];
  const logs = [];
  class FakePool {
    constructor() { events.push("pool"); }
    on(event, listener) { this.listener = listener; events.push(event); }
    async query(config) { events.push(config); return { rows: [{ ok: 1 }], rowCount: 1 }; }
    async connect() {
      events.push("connect");
      return {
        async query(config) {
          events.push(config);
          if (config === "ROLLBACK" && failRollback) throw Object.assign(new Error("sensitive detail"), { code: "08006" });
          return { command: config === "COMMIT" ? commitCommand : config, rows: [], rowCount: 0 };
        },
        release(error) { events.push(["release", error?.code || Boolean(error)]); },
      };
    }
    async end() { events.push("end"); }
  }
  const adapter = createDatabaseAdapter({ environment, PoolClass: FakePool, logger: { error: (...args) => logs.push(args) } });
  return { adapter, events, logs };
}

test("lazy pool and native parameter binding preserve result shape", async () => {
  const { adapter, events } = harness();
  assert.deepEqual(events, []);
  const result = await adapter.query("SELECT $1::int AS ok", [1]);
  assert.deepEqual(result, { rows: [{ ok: 1 }], rowCount: 1 });
  assert.deepEqual(events, ["pool", "error", { text: "SELECT $1::int AS ok", values: [1], queryMode: "extended" }]);
  await adapter.close();
});

test("transaction uses one client and expires the callback scope", async () => {
  const { adapter, events } = harness();
  let escaped;
  const value = await adapter.withTransaction(async (tx) => {
    escaped = tx;
    await tx.query("SELECT $1", [9]);
    return 9;
  });
  assert.equal(value, 9);
  assert.deepEqual(events, ["pool", "error", "connect", "BEGIN", { text: "SELECT $1", values: [9], queryMode: "extended" }, "COMMIT", ["release", false]]);
  await assert.rejects(escaped.query("SELECT 1"), /scope has ended/);
  await adapter.close();
});

test("rollback preserves the original error and discards a broken client", async () => {
  const { adapter, events, logs } = harness({ failRollback: true });
  const original = new Error("callback failed");
  await assert.rejects(adapter.withTransaction(async () => { throw original; }), (error) => error === original);
  assert.deepEqual(events.slice(-2), ["ROLLBACK", ["release", "08006"]]);
  assert.deepEqual(logs, [["PostgreSQL rollback failed", { code: "08006" }]]);
  await adapter.close();
});

test("swallowed server error cannot masquerade as a successful commit", async () => {
  const { adapter } = harness({ commitCommand: "ROLLBACK" });
  await assert.rejects(adapter.withTransaction(async () => 1), /did not commit/);
  await adapter.close();
});

test("reject pool-level transaction commands; close is idempotent", async () => {
  const { adapter, events } = harness();
  await assert.rejects(adapter.query("-- comment\n BEGIN"), /withTransaction/);
  await assert.rejects(adapter.query("/* comment */ COMMIT"), /withTransaction/);
  assert.deepEqual(events, []);
  assert.deepEqual(await adapter.verifyDatabaseConnection(), { connected: true });
  await Promise.all([adapter.close(), adapter.close()]);
  assert.equal(events.filter((event) => event === "end").length, 1);
  await assert.rejects(adapter.query("SELECT 1"), /closed/);
});
