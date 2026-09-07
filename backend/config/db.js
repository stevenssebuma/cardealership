import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Check backend/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Required for most hosted PostgreSQL databases, including Render.
  ssl: {
    rejectUnauthorized: false,
  },

  max: 5,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connection established");
});

pool.on("error", (error) => {
  console.error("❌ PostgreSQL pool error:", {
    message: error.message,
    code: error.code,
    severity: error.severity,
  });
});

export async function verifyDatabaseConnection() {
  let client;

  try {
    client = await pool.connect();
    const result = await client.query("SELECT NOW()");

    console.log("✅ Database test successful:", result.rows[0]);

    return { connected: true };
  } catch (error) {
    console.error("❌ Database connection failed:", {
      message: error.message,
      code: error.code,
      errno: error.errno,
      address: error.address,
      port: error.port,
    });

    return {
      connected: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  } finally {
    client?.release();
  }
}

const db = {
  query(text, params = []) {
    return pool.query(text, params);
  },
  pool,
};

export default db;
