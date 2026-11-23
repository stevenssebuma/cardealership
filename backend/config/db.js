// Canonical PostgreSQL persistence adapter (TSK-022).
// No schema mutation, fixture creation or network connection occurs on import.
import "dotenv/config";
import pg from "pg";
import { buildPoolConfig } from "./databasePoolConfig.js";

const { Pool } = pg;
const transactionCommand = /^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE\s+SAVEPOINT|SET\s+TRANSACTION)\b/i;

function errorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/i.test(error.code)
    ? error.code
    : "DATABASE_ERROR";
}

function assertQuery(text, params) {
  if (typeof text !== "string" || !text.trim() || !Array.isArray(params)) {
    throw new TypeError("query requires non-empty SQL text and an array of parameters.");
  }
}

function firstCommand(text) {
  return text.replace(/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*/u, "");
}

export function createDatabaseAdapter({
  environment = process.env,
  PoolClass = Pool,
  logger = console,
} = {}) {
  let pool;
  let closed = false;
  let closePromise;

  const getPool = () => {
    if (closed) throw new Error("PostgreSQL adapter is closed.");
    if (!pool) {
      pool = new PoolClass(buildPoolConfig(environment));
      pool.on("error", (error) => {
        // Do not log SQL, parameters, detail fields or connection URLs.
        logger.error("PostgreSQL idle client error", { code: errorCode(error) });
      });
    }
    return pool;
  };

  const query = async (text, params = []) => {
    assertQuery(text, params);
    if (transactionCommand.test(firstCommand(text))) {
      throw new Error("Use withTransaction for connection-scoped transactions.");
    }
    // Retain native PostgreSQL rows/rowCount; consumer-specific coercion
    // belongs at API boundaries, not in the shared adapter.
    // Extended protocol enforces a single statement even when params is empty.
    // This prevents a second statement from leaving a shared pool client in
    // a transaction that bypasses the leading-command guard.
    return getPool().query({ text, values: params, queryMode: "extended" });
  };

  const withTransaction = async (work) => {
    if (typeof work !== "function") {
      throw new TypeError("withTransaction requires a callback.");
    }
    const client = await getPool().connect();
    let started = false;
    let discardError;
    try {
      await client.query("BEGIN");
      started = true;
      let active = true;
      const tx = Object.freeze({
        query: async (text, params = []) => {
          if (!active) throw new Error("Transaction scope has ended.");
          assertQuery(text, params);
          if (transactionCommand.test(firstCommand(text))) {
            throw new Error("Transaction control belongs to withTransaction.");
          }
          return client.query({ text, values: params, queryMode: "extended" });
        },
      });
      let result;
      try {
        result = await work(tx);
      } finally {
        active = false;
      }
      const outcome = await client.query("COMMIT");
      started = false;
      if (outcome.command !== "COMMIT") {
        throw new Error("PostgreSQL transaction did not commit.");
      }
      return result;
    } catch (error) {
      if (started) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          discardError = rollbackError;
          logger.error("PostgreSQL rollback failed", { code: errorCode(rollbackError) });
        }
      } else {
        discardError = error;
      }
      throw error;
    } finally {
      // Do not return a connection with an uncertain transaction state.
      client.release(discardError);
    }
  };

  const verifyDatabaseConnection = async () => {
    try {
      const result = await query("SELECT 1 AS ok");
      return { connected: result.rows[0]?.ok === 1 };
    } catch (error) {
      return { connected: false, code: errorCode(error) };
    }
  };

  const close = () => {
    if (closePromise) return closePromise;
    closed = true;
    closePromise = pool ? Promise.resolve().then(() => pool.end()) : Promise.resolve();
    return closePromise;
  };

  return Object.freeze({ query, withTransaction, verifyDatabaseConnection, close });
}

const db = createDatabaseAdapter();
export const withTransaction = db.withTransaction;
export const verifyDatabaseConnection = db.verifyDatabaseConnection;
export const closeDatabase = db.close;
export default db;
