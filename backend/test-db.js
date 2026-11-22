import db from './config/db.js';
import { runOperation } from './scripts/databaseOperations.js';
await runOperation(async () => {
  const result = await db.verifyDatabaseConnection();
  if (!result.connected) process.exitCode = 1;
  return result;
}, db.close);
