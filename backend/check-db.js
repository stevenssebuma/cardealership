import db from './config/db.js';
import { inspectDatabaseReadiness, REQUIRED_SCHEMA } from './config/databaseReadiness.js';
import { runOperation } from './scripts/databaseOperations.js';

await runOperation(async () => {
  const readiness = await inspectDatabaseReadiness(db);
  const counts = {};
  for (const table of Object.keys(REQUIRED_SCHEMA)) {
    if (!readiness.missingTables.includes(table) && !readiness.missingPrivileges.includes(table)) {
      const { rows } = await db.query(`SELECT COUNT(*) AS count FROM public.${table}`);
      counts[table] = rows[0].count;
    }
  }
  if (!readiness.ready) process.exitCode = 1;
  return { success: readiness.ready, ...readiness, counts };
}, db.close);
