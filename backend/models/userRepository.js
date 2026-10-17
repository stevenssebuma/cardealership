import db from "../config/db.js";

const safeFields = "id, name, email, role, created_at";

export async function findUserByEmail(email) {
  const result = await db.query(
    `SELECT id, name, email, password, role, created_at FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await db.query(
    `SELECT id, name, email, password, role, created_at FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

export async function createUser({ name, email, password, role = "customer" }) {
  const result = await db.query(
    `INSERT INTO users (name, email, password, role) VALUES ($1, LOWER($2), $3, $4) RETURNING ${safeFields}`,
    [name.trim(), email.trim(), password, role],
  );
  return result.rows[0];
}

export async function listUsers() {
  const result = await db.query(
    `SELECT ${safeFields} FROM users ORDER BY created_at DESC, id DESC`,
  );
  return result.rows;
}

export async function updateUserPassword(id, password) {
  const result = await db.query(
    `UPDATE users SET password = $2 WHERE id = $1 RETURNING id`,
    [id, password],
  );
  return result.rows[0] || null;
}

export async function deleteUser(id) {
  const result = await db.query(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [id],
  );
  return result.rows[0] || null;
}
