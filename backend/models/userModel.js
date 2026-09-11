import db from "../config/db.js";

export const updateUserPassword = async (userId, hashedPassword) => {
  const result = await db.query(
    `
      UPDATE users
      SET password = $1
      WHERE id = $2
      RETURNING id
    `,
    [hashedPassword, userId]
  );

  return result.rows[0] || null;
};

// FIND USER BY EMAIL
export const findUserByEmail = async (email) => {
  const result = await db.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  return result.rows[0];
};

// FIND USER BY ID
export const findUserById = async (id) => {
  const result = await db.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [id]
  );

  return result.rows[0];
};

// CREATE USER
export const createUser = async (name, email, password, role) => {
  const result = await db.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role`,
    [name, email, password, role]
  );

  return result.rows[0];
};

// UPDATE CURRENT USER PROFILE
export const updateUserProfile = async (id, name, email) => {
  const result = await db.query(
    `UPDATE users
     SET name = $1,
         email = $2
     WHERE id = $3
     RETURNING id, name, email, role`,
    [name, email, id]
  );

  return result.rows[0];
};