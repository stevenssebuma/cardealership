import db from '../config/db.js';
import { inspectIndexes } from '../config/indexes.js';
import { runOperation } from './databaseOperations.js';
// Provisioning/repair is an explicit reviewed migration, never an implicit write.
await runOperation(async () => {
  const result = await inspectIndexes(db);
  if (!result.verified) process.exitCode = 1;
  return result;
}, db.close);
