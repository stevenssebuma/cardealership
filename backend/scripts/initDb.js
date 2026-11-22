import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { assertMutationTarget, verifyTarget, runOperation, operationError } from './databaseOperations.js';
import { inspectDatabaseReadiness } from '../config/databaseReadiness.js';

let client;
await runOperation(async () => {
  const config = assertMutationTarget();
  client = new pg.Client(config);
  await client.connect();
  await verifyTarget(client, config.database);
  await client.query('SELECT pg_advisory_lock(17022)');
  const { rows } = await client.query(`SELECT c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')`);
  if (rows.length) {
    if ((await inspectDatabaseReadiness(client)).ready) return { success: true, status: 'ALREADY_INITIALIZED' };
    throw operationError('NONEMPTY_DATABASE_REQUIRES_REVIEWED_MIGRATION');
  }
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  try { await client.query(sql); } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
  if (!(await inspectDatabaseReadiness(client)).ready) throw operationError('DATABASE_NOT_READY');
  return { success: true, status: 'INITIALIZED' };
}, async () => { if (client) await client.end(); });
