import 'dotenv/config';
import pg from 'pg';
import { lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertMutationTarget, verifyTarget, operationError, runOperation } from './databaseOperations.js';
import { parseArgs, snapshotHeader, validName, verifyColumns, scalar, writeSnapshot } from './migrationSnapshot.js';

let release = async () => {};
await runOperation(async () => {
  const kind=process.argv[2];
  const required=kind==='sqlite' ? ['--source','--out'] : kind==='postgresql' ? ['--confirm','--out'] : [];
  if (!required.length) throw operationError('INVALID_MIGRATION_ARGUMENTS');
  const args=parseArgs(process.argv.slice(3),required,['--assume-utc']);
  if (!args['--assume-utc']) throw operationError('EXPLICIT_TIMESTAMP_POLICY_REQUIRED');
  const snapshot=snapshotHeader(kind);
  if (kind==='sqlite') {
    // Offline extraction only. The API has no SQLite dependency or fallback.
    const source=await realpath(args['--source']);
    if (!(await lstat(source)).isFile() || source===resolve(args['--out'])) throw operationError('INVALID_SOURCE_FILE');
    const {DatabaseSync}=await import('node:sqlite');
    const db=new DatabaseSync(source,{readOnly:true});
    release=async()=>db.close();
    db.exec('PRAGMA query_only=ON; BEGIN;');
    if (db.prepare('PRAGMA integrity_check').all().some(r=>r.integrity_check!=='ok') ||
        db.prepare('PRAGMA foreign_key_check').all().length) throw operationError('SOURCE_INTEGRITY_FAILED');
    const catalog=db.prepare("SELECT name,type FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND type IN ('table','view','trigger')").all();
    if (catalog.some(r=>r.type!=='table'||!validName(r.name))) throw operationError('UNMAPPED_SOURCE_SCHEMA');
    const hasSequence=!!db.prepare("SELECT name FROM sqlite_schema WHERE name='sqlite_sequence'").get();
    for (const {name} of catalog) {
      const cols=db.prepare(`PRAGMA table_xinfo("${name}")`).all().map(r=>r.name);
      verifyColumns(name,cols);
      const statement=db.prepare(`SELECT * FROM "${name}" ORDER BY id`);
      statement.setReadBigInts(true);
      const rows=statement.all().map(r=>Object.fromEntries(Object.entries(r).map(([key,value])=>[key,scalar(value)])));
      const seq=hasSequence ? db.prepare("SELECT CAST(seq AS TEXT) AS seq FROM sqlite_sequence WHERE name=?").get(name)?.seq : null;
      snapshot.tables[name]={columns:cols,highWater:seq??null,rows};
    }
    db.exec('COMMIT');
  } else {
    // Only an explicitly designated development/test/staging CLONE is allowed.
    const config=assertMutationTarget(process.env,['--confirm',args['--confirm']]);
    const client=new pg.Client(config);
    release=async()=>client.end();
    await client.connect();
    await verifyTarget(client, config.database);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL DateStyle TO 'ISO, YMD'");
    const {rows:catalog}=await client.query(`SELECT c.relname AS name,c.relkind,n.nspname AS schema FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND c.relkind IN ('r','p','v','m','f')`);
    if(catalog.some(r=>r.schema!=='public'||r.relkind!=='r'||!validName(r.name))) throw operationError('UNMAPPED_SOURCE_SCHEMA');
    for(const {name} of catalog) {
      const {rows:meta}=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[name]);
      const cols=meta.map(r=>r.column_name);
      verifyColumns(name,cols);
      // Read text representations so bigint, decimal and microseconds survive JSON.
      const {rows}=await client.query(`SELECT (SELECT jsonb_object_agg(key,value) FROM jsonb_each_text(to_jsonb(t))) AS row FROM public."${name}" t ORDER BY id`);
      const {rows:[seq]}=await client.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS identifier,
        s.seqincrement::text AS increment,s.seqcycle AS cycle FROM pg_sequence s
        JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE s.seqrelid=pg_get_serial_sequence($1,'id')::regclass`,['public.'+name]);
      let highWater=null;
      if(seq) {
        if(seq.increment!=='1'||seq.cycle) throw operationError('SOURCE_SEQUENCE_REQUIRES_REVIEW');
        const {rows:[state]}=await client.query(`SELECT last_value::text,is_called FROM ${seq.identifier}`);
        highWater=(BigInt(state.last_value)-(state.is_called?0n:1n)).toString();
      }
      snapshot.tables[name]={columns:cols,highWater,rows:rows.map(r=>r.row)};
    }
    await client.query('COMMIT');
  }
  return writeSnapshot(args['--out'],snapshot);
},async()=>release());
