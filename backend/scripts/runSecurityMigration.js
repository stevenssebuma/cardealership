import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../config/db.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const migrationPath = path.join(
  currentDirectory,
  "008_security_sessions_mfa.sql"
);

try {
  const sql = await fs.readFile(migrationPath, "utf8");

  await pool.query(sql);

  console.log("Security migration completed successfully.");
} catch (error) {
  console.error("Security migration failed:");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
