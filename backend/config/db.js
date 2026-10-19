import pg from "pg";
import dotenv from "dotenv";

const { Pool } = pg;
const isTest = process.env.NODE_ENV === "test";

if (!isTest) {
  const envFile =
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development";
  dotenv.config({ path: envFile, quiet: true });
  dotenv.config({ path: `backend/${envFile}`, quiet: true });
}

function getConnectionString() {
  if (!isTest) return process.env.DATABASE_URL;

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required when NODE_ENV=test. Refusing to use DATABASE_URL for API tests.",
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
    throw new Error(
      "TEST_DATABASE_URL must point to a database whose name contains 'test'. Refusing to run API tests against a non-test database.",
    );
  }

  return testUrl;
}

function useDatabaseSsl() {
  if (process.env.DATABASE_SSL !== undefined)
    return process.env.DATABASE_SSL === "true";
  return (
    process.env.NODE_ENV === "production" ||
    (isTest && process.env.TEST_DATABASE_SSL === "true")
  );
}

const connectionString = getConnectionString();
if (!connectionString) {
  throw new Error("DATABASE_URL is required outside the API test environment.");
}

const pool = new Pool({
  connectionString,
  ssl: useDatabaseSsl() ? { rejectUnauthorized: false } : false,
});

pool.on("error", (error) => {
  console.error("Database pool error", {
    code: error.code || "DATABASE_POOL_ERROR",
    message: "An unexpected database connection error occurred.",
  });
});

export async function verifyDatabaseConnection() {
  try {
    const client = await pool.connect();
    client.release();
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: {
        code: error.code || "DATABASE_CONNECTION_FAILED",
        message: "Database connection could not be established.",
      },
    };
  }
}

const db = {
  async query(text, params = []) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      if (process.env.API_TEST_SILENT_DATABASE_ERRORS !== "true") {
        console.error("Database query failed", {
          code: error.code || "DATABASE_QUERY_FAILED",
          message: "A database query could not be completed.",
        });
      }
      throw error;
    }
  },
  pool,
};

export default db;
