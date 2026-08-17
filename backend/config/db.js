import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

console.log("DATABASE_URL loaded:", !!process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected to Render");
});

pool.on("error", (error) => {
  console.error("❌ PostgreSQL pool error:", error.message);
});

export async function verifyDatabaseConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Database test successful:", result.rows[0]);

    return { connected: true };
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return {
      connected: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }
}

const db = {
  async query(text, params = []) {
    return pool.query(text, params);
  },
  pool,
};

export default db;