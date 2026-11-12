// backend/reset-admin.js
//
// Creates (or resets) the development administrator account using PostgreSQL
// placeholders. The auth controller verifies passwords with bcryptjs, so the
// hash is produced with the same library.
//
// Usage: cd backend && node reset-admin.js

import bcrypt from "bcryptjs";

import db, { initializeDatabase } from "./config/db.js";

const ADMIN_EMAIL = "admin@dealership.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Dealership Admin";

async function resetAdmin() {
  await initializeDatabase();

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const existing = await db.query(
    "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [ADMIN_EMAIL],
  );

  if (existing.rows.length > 0) {
    await db.query(
      "UPDATE users SET password = $1, role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, existing.rows[0].id],
    );
    console.log(`Admin password reset for ${ADMIN_EMAIL}`);
    return;
  }

  await db.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, 'admin')`,
    [ADMIN_NAME, ADMIN_EMAIL, passwordHash],
  );

  console.log(`Admin created: ${ADMIN_EMAIL}`);
}

resetAdmin()
  .then(() => db.end())
  .catch(async (error) => {
    console.error("Admin reset failed:", error.message);
    await db.end();
    process.exitCode = 1;
  });
