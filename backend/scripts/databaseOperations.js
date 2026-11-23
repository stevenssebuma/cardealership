import { buildPoolConfig } from '../config/databasePoolConfig.js';
import { inspectDatabaseReadiness } from '../config/databaseReadiness.js';

export const operationError = code => Object.assign(new Error(code), { code });
export function assertMutationTarget(environment = process.env, args = process.argv.slice(2)) {
  if (!['development', 'test', 'staging'].includes(environment.NODE_ENV)) {
    throw operationError('MUTATION_ENVIRONMENT_FORBIDDEN');
  }
  const config = buildPoolConfig(environment);
  const name = config.database;
  if (!/(?:^|[_-])(?:dev|development|test|stage|staging)(?:[_-]|$)/i.test(name) ||
      /(?:^|[_-])(?:prod|production|live)(?:[_-]|$)/i.test(name)) {
    throw operationError('MUTATION_TARGET_FORBIDDEN');
  }
  if (args.length !== 2 || args[0] !== '--confirm' || args[1] !== name) {
    throw operationError('EXACT_DATABASE_CONFIRMATION_REQUIRED');
  }
  return config;
}
export async function verifyTarget(database, expected) {
  const { rows } = await database.query('SELECT current_database() AS name');
  if (rows[0]?.name !== expected) throw operationError('DATABASE_TARGET_MISMATCH');
}
export async function requireReady(database) {
  if (!(await inspectDatabaseReadiness(database)).ready) throw operationError('DATABASE_NOT_READY');
}
export async function runOperation(work, close = async () => {}) {
  try { console.log(JSON.stringify(await work())); }
  catch (error) {
    const code = /^[A-Z0-9_]{1,64}$/.test(error?.code ?? '') ? error.code : 'DATABASE_OPERATION_FAILED';
    console.error(JSON.stringify({ success: false, code }));
    process.exitCode = 1;
  } finally {
    try { await close(); } catch { process.exitCode = 1; }
  }
}
