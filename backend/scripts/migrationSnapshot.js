import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { REQUIRED_SCHEMA } from '../config/databaseReadiness.js';
import { operationError } from './databaseOperations.js';

export const tables = Object.freeze(Object.keys(REQUIRED_SCHEMA));
export const columns = Object.freeze(Object.fromEntries(tables.map(t => [t, REQUIRED_SCHEMA[t].split(' ')])));
const maxBytes = 128 * 1024 * 1024;
const fail = code => { throw operationError(code); };
export const digest = buffer => createHash('sha256').update(buffer).digest('hex');
export const validName = name => tables.includes(name);
export function verifyColumns(table, names) {
  if (!validName(table) || !Array.isArray(names) || !names.includes('id') ||
      new Set(names).size !== names.length || names.some(n => !columns[table].includes(n))) {
    fail('UNMAPPED_SOURCE_SCHEMA');
  }
}
export function scalar(value) {
  if (value === null) return null;
  if (['string','bigint','boolean'].includes(typeof value)) return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  fail('UNSUPPORTED_SOURCE_VALUE');
}
export async function writeSnapshot(path, snapshot) {
  const buffer = Buffer.from(JSON.stringify(snapshot));
  if (buffer.length > maxBytes) fail('SNAPSHOT_TOO_LARGE');
  await writeFile(path, buffer, {mode:0o600,flag:'wx'});
  return {success:true, sha256:digest(buffer), counts:Object.fromEntries(Object.entries(snapshot.tables).map(([t,v])=>[t,v.rows.length]))};
}
export async function readSnapshot(path, expected) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > maxBytes || (info.mode & 0o077)) fail('SNAPSHOT_MUST_BE_PRIVATE_REGULAR_FILE');
  const buffer = await readFile(path);
  if (buffer.length > maxBytes || !/^[a-f0-9]{64}$/.test(expected) || digest(buffer) !== expected) fail('SNAPSHOT_DIGEST_MISMATCH');
  try { return JSON.parse(buffer.toString('utf8')); } catch { fail('INVALID_SNAPSHOT'); }
}
export function snapshotHeader(source) {
  return {version:1, source, naiveTimestamps:'UTC', tables:{}};
}
export function parseArgs(args, required, switches = []) {
  const values = {};
  for (let i=0;i<args.length;i++) {
    const key=args[i];
    if (Object.hasOwn(values,key)) fail('INVALID_MIGRATION_ARGUMENTS');
    if (switches.includes(key)) values[key]=true;
    else if (required.includes(key) && args[i+1] && !args[i+1].startsWith('--')) values[key]=args[++i];
    else fail('INVALID_MIGRATION_ARGUMENTS');
  }
  if (required.some(key => !Object.hasOwn(values,key))) fail('INVALID_MIGRATION_ARGUMENTS');
  return values;
}
