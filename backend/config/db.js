import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Check backend/.env");
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Managed providers (Render, Neon, Supabase) require TLS, while a developer's
 * local PostgreSQL usually runs without it. Decide from the connection string
 * so both work, and let DATABASE_SSL force either behaviour.
 */
function resolveSsl(connectionString) {
  const override = (process.env.DATABASE_SSL || "").trim().toLowerCase();

  if (override === "true" || override === "require") {
    return { rejectUnauthorized: false };
  }

  if (override === "false" || override === "disable") {
    return false;
  }

  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get("sslmode");

    if (sslMode === "disable") return false;
    if (sslMode === "require" || sslMode === "no-verify") {
      return { rejectUnauthorized: false };
    }

    return LOCAL_HOSTS.has(parsed.hostname) ? false : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSsl(process.env.DATABASE_URL),
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

/**
 * Runs `callback(client)` inside a single connection's transaction.
 *
 * BEGIN, the callback's statements and COMMIT/ROLLBACK all run on the same
 * checked-out client, which is always released. Never call this from inside
 * another withTransaction callback — it is pool-level only.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Transaction rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

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

  // Older databases may have a users table created without these columns.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_index
    ON users (LOWER(email));
  `);

  console.log("Users table verified");

  // Inventory tables consumed by models/carsModel.js through /api/cars.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cars (
      id SERIAL PRIMARY KEY,
      vin VARCHAR(17) UNIQUE,
      make VARCHAR(120) NOT NULL,
      model VARCHAR(120),
      name VARCHAR(200) NOT NULL,
      type VARCHAR(80) NOT NULL DEFAULT 'Vehicle',
      category VARCHAR(60) NOT NULL DEFAULT 'luxury',
      year INTEGER NOT NULL,
      price NUMERIC(14, 2) NOT NULL,
      mileage INTEGER,
      color VARCHAR(60),
      condition VARCHAR(20) NOT NULL DEFAULT 'New',
      status VARCHAR(30) NOT NULL DEFAULT 'Available',
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      drafted_at TIMESTAMP,
      deleted_at TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS car_specs (
      id SERIAL PRIMARY KEY,
      car_id INTEGER NOT NULL UNIQUE REFERENCES cars(id) ON DELETE CASCADE,
      power VARCHAR(60),
      engine VARCHAR(120),
      drive VARCHAR(60)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS car_images (
      id SERIAL PRIMARY KEY,
      car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      image_type VARCHAR(30) NOT NULL DEFAULT 'general',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS cars_created_at_index
    ON cars (created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS car_images_car_id_index
    ON car_images (car_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
      booking_date DATE NOT NULL,
      time_slot VARCHAR(40) NOT NULL,
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Existing databases created before reminders were tracked.
  await pool.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS bookings_car_date_index
    ON bookings (car_id, booking_date);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS bookings_status_index
    ON bookings (status);
  `);

  // Device-aware sessions used by services/sessionManager.js and /api/sessions.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id VARCHAR(64) NOT NULL,
      device_name VARCHAR(120),
      device_type VARCHAR(40),
      token_fingerprint VARCHAR(128) NOT NULL UNIQUE,
      user_agent TEXT,
      ip_address VARCHAR(64),
      is_current BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_sessions_user_index
    ON auth_sessions (user_id);
  `);

  console.log("Inventory, booking and session tables verified");
}

export default pool;
