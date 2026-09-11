/**
 * Database Migration Runner
 * Executes the 008_security_sessions_mfa.sql against the PostgreSQL database
 */

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');
    console.log('Reading SQL file...');

    const sqlPath = path.join(__dirname, '008_security_sessions_mfa.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL migrations...\n');

    // Execute the SQL content
    await client.query(sqlContent);

    console.log('\n✅ Database migration completed successfully!');
    console.log('Created tables:');
    console.log('  - auth_sessions');
    console.log('  - user_mfa');
    console.log('  - mfa_backup_codes');
    console.log('  - mfa_attempts');
    console.log('\nAdded columns to users table:');
    console.log('  - mfa_enabled');
    console.log('  - mfa_verified_at');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
