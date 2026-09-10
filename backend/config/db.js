import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Check backend/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
});

pool.on("connect", () => {
  console.log("PostgreSQL connection established");
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export async function verifyDatabaseConnection() {
  try {
    const result = await pool.query(`
      SELECT NOW() AS current_time,
             current_database() AS database_name
    `);

    return {
      connected: true,
      database: result.rows[0].database_name,
      time: result.rows[0].current_time,
    };
  } catch (error) {
    return {
      connected: false,
      error,
    };
  }
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      phone VARCHAR(50),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_index
    ON users (LOWER(email));
  `);

  console.log("Users table verified");
}

export default pool;
