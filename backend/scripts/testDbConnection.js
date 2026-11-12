import pool from "../config/db.js";

try {
  console.log("Testing PostgreSQL connection...");

  const result = await pool.query(
    "SELECT NOW() AS current_time, current_database() AS database_name"
  );

  console.log("Database connection works.");
  console.log(result.rows[0]);
} catch (error) {
  console.error("Database connection failed.");
  console.error({
    name: error.name,
    code: error.code,
    message: error.message,
    detail: error.detail,
    hint: error.hint,
    stack: error.stack,
  });
} finally {
  await pool.end();
}
