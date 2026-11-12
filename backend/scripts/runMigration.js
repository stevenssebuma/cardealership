/**
 * Database Migration Runner
 *
 * Executes a SQL migration file against the PostgreSQL database configured by
 * backend/.env. Environment loading and SSL configuration come from
 * config/db.js so this script can never drift from the API's connection rules.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env explicitly so the script works from any working directory.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Imported after the environment is loaded so config/db.js sees DATABASE_URL.
const { default: pool } = await import('../config/db.js');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');
    console.log('Reading SQL file...');

    const sqlPath = path.join(__dirname, '008_security_sessions_mfa.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL migrations...\n');

    await client.query(sqlContent);

    console.log('\nDatabase migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
