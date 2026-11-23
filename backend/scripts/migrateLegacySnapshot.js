import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { assertMutationTarget, verifyTarget, requireReady, operationError, runOperation } from './databaseOperations.js';
import { tables, columns, verifyColumns, parseArgs, readSnapshot } from './migrationSnapshot.js';
import { VALID_TIME_SLOTS } from '../utils/validators.js';

const fail=code=>{throw operationError(code);};
const required={
  users:'id name email password role created_at',
  cars:'id name status created_at',
  car_specs:'id car_id created_at updated_at',
  car_images:'id car_id image_url image_type created_at',
  bookings:'id user_id car_id booking_date time_slot status created_at updated_at',
  financing_leads:'id reference_code idempotency_key car_id customer_name customer_phone vehicle_price_snapshot down_payment loan_amount annual_interest_rate loan_term_months monthly_payment total_payment total_interest currency status contact_consent consented_at created_at updated_at',
  exchange_rate_snapshots:'id base_currency rates provider retrieved_at expires_at created_at',
  vehicle_spotlights:'id car_id score tier reason is_read tagged_at',
};
const core=['users','cars','car_specs','car_images','bookings'];
const bigIds=new Set(['financing_leads','exchange_rate_snapshots','vehicle_spotlights']);
const money=new Set(['price','vehicle_price_snapshot','down_payment','loan_amount','monthly_payment','total_payment','total_interest']);
const idLimit=table=>bigIds.has(table)?9223372036854775807n:2147483647n;
function integer(value, max, allowZero=false) {
  if(typeof value!=='string'||!/^\d+$/.test(value)) fail('INVALID_SOURCE_INTEGER');
  const n=BigInt(value);
  if(n>max||n<(allowZero?0n:1n)) fail('INVALID_SOURCE_INTEGER');
  return n;
}
function date(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_SOURCE_DATE');
  const parsed=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value) fail('INVALID_SOURCE_DATE');
  return value;
}
function timestamp(value) {
  const match=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,6})?(Z|[+-]\d{2}(?::\d{2})?)?$/.exec(value);
  if(!match) fail('INVALID_SOURCE_TIMESTAMP');
  date(match[1]);
  const zone=match[4]??'Z';
  const normalizedZone=/^[+-]\d{2}$/.test(zone)?zone+':00':zone;
  const result=match[1]+'T'+match[2]+(match[3]??'')+normalizedZone;
  if(!Number.isFinite(Date.parse(result))||Number(match[2].slice(0,2))>23||Number(match[2].slice(3,5))>59||Number(match[2].slice(6,8))>59) fail('INVALID_SOURCE_TIMESTAMP');
  return result;
}
function decimal(value, scale, precision) {
  const match=/^(\d+)(?:\.(\d+))?$/.exec(value);
  if(!match||match[1].replace(/^0+/,'').length>precision-scale||(match[2]??'').replace(/0+$/,'').length>scale) fail('SOURCE_DECIMAL_REQUIRES_REVIEW');
}
function normalize(table, input, names) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==names.length||
     names.some(name=>!Object.hasOwn(input,name)||!(input[name]===null||typeof input[name]==='string'))) fail('INVALID_SOURCE_ROW');
  const row=Object.fromEntries(columns[table].filter(c=>c!=='is_available').map(c=>[c,input[c]??null]));
  for(const name of required[table].split(' ')) if(row[name]===null||row[name]==='') fail('REQUIRED_SOURCE_VALUE_MISSING');
  integer(row.id,idLimit(table));
  for(const [key,value] of Object.entries(row)) {
    if(value===null) continue;
    if(['car_id','user_id','deleted_by'].includes(key)) integer(value,2147483647n);
    if(key.endsWith('_at')) row[key]=timestamp(value);
    if(key==='booking_date') row[key]=date(value);
    if(money.has(key)) decimal(value,2,14);
    if(key==='annual_interest_rate') decimal(value,3,6);
    if(['mileage','year','score','loan_term_months'].includes(key)) integer(value,2147483647n,true);
    if(['is_read','contact_consent'].includes(key)) {
      if(!['0','1','true','false'].includes(value)) fail('INVALID_SOURCE_BOOLEAN');
      row[key]=['1','true'].includes(value)?'true':'false';
    }
  }
  if(table==='users') {
    // Do not silently grant privileges to a role the previous API did not authorize.
    if(!['admin','user'].includes(row.role)||!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(row.password)) fail('SOURCE_ACCOUNT_REQUIRES_REVIEW');
  }
  if(table==='cars') {
    if(row.make && row.brand && row.make!==row.brand) fail('SOURCE_MAKE_BRAND_CONFLICT');
    row.make=row.make??row.brand;
    row.brand=row.brand??row.make;
    row.updated_at=row.updated_at??row.created_at;
    if(!['available','sold','pending','rejected'].includes(row.status.toLowerCase())) fail('SOURCE_CAR_STATUS_REQUIRES_REVIEW');
    row.status=row.status.toLowerCase();
    if(input.is_available!=null && (!['0','1','true','false'].includes(input.is_available)||
      ['1','true'].includes(input.is_available)!==(row.status==='available'))) fail('SOURCE_AVAILABILITY_CONFLICT');
  }
  if(table==='bookings') {
    if(!['pending','confirmed','completed','cancelled'].includes(row.status.toLowerCase())) fail('SOURCE_BOOKING_STATUS_REQUIRES_REVIEW');
    row.status=row.status.toLowerCase();
    if(!VALID_TIME_SLOTS.includes(row.time_slot)) fail('SOURCE_BOOKING_SLOT_REQUIRES_REVIEW');
  }
  if(table==='financing_leads') row.admin_notes=row.admin_notes??'';
  if(table==='exchange_rate_snapshots') {
    let rates;
    try {rates=JSON.parse(row.rates);} catch {fail('INVALID_SOURCE_RATES');}
    if(!/^[A-Z]{3}$/.test(row.base_currency)||!rates||Array.isArray(rates)||typeof rates!=='object'||
      rates[row.base_currency]!==1||Object.entries(rates).some(([key,value])=>!(/^[A-Z]{3}$/.test(key)&&typeof value==='number'&&Number.isFinite(value)&&value>0))||
      (row.rates.match(/"[A-Z]{3}"\s*:/g)??[]).length!==Object.keys(rates).length) fail('INVALID_SOURCE_RATES');
    // Keep the original JSON text, not a round-tripped JS numeric representation.
  }
  return row;
}
function validateSnapshot(snapshot) {
  if(!snapshot||snapshot.version!==1||!['sqlite','postgresql'].includes(snapshot.source)||
    snapshot.naiveTimestamps!=='UTC'||!snapshot.tables||Array.isArray(snapshot.tables)||typeof snapshot.tables!=='object'||
    Object.keys(snapshot.tables).some(name=>!tables.includes(name))||core.some(name=>!Object.hasOwn(snapshot.tables,name))) fail('INVALID_SOURCE_SNAPSHOT');
  const output={};
  for(const table of tables) {
    const data=snapshot.tables[table];
    if(!data) {output[table]={rows:[],next:1n};continue;}
    verifyColumns(table,data.columns);
    if(!Array.isArray(data.rows)||required[table].split(' ').some(name=>!data.columns.includes(name))) fail('INVALID_SOURCE_SNAPSHOT');
    let high=data.highWater===null?0n:integer(data.highWater,idLimit(table),true);
    const rows=data.rows.map(input=>{
      const row=normalize(table,input,data.columns);
      const id=BigInt(row.id); if(id>high) high=id;
      return row;
    });
    if(high>=idLimit(table)) fail('IDENTITY_SEQUENCE_EXHAUSTED');
    output[table]={rows,next:high+1n};
  }
  return output;
}

let client;
await runOperation(async()=>{
  const args=parseArgs(process.argv.slice(2),['--confirm','--file','--sha256'],['--apply']);
  const config=assertMutationTarget(process.env,['--confirm',args['--confirm']]);
  const data=validateSnapshot(await readSnapshot(args['--file'],args['--sha256']));
  // No default commit: the full dry run rolls back schema, records and identity restarts.
  client=new pg.Client(config);
  await client.connect();
  await verifyTarget(client,config.database);
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(17022)');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const {rows:objects}=await client.query(`SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
      AND c.relkind IN ('r','p','v','m','f','S')`);
    if(objects.length) fail('MIGRATION_REQUIRES_EMPTY_TARGET');
    const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
    if(!/^BEGIN;$/m.test(schema)||!/COMMIT;\s*$/.test(schema)) fail('MIGRATION_SCHEMA_CONTRACT_CHANGED');
    await client.query(schema.replace(/^BEGIN;$/m,'').replace(/COMMIT;\s*$/,''));
    const counts={};
    for(const table of tables) {
      const {rows,next}=data[table];
      const fields=columns[table].filter(c=>c!=='is_available').map(c=>'"'+c+'"').join(',');
      for(let offset=0;offset<rows.length;offset+=500) {
        const json=JSON.stringify(rows.slice(offset,offset+500));
        // JSONB's populate_recordset preserves JSON strings as strings.
        // Decode the original JSON text in PostgreSQL to retain exact numbers.
        const payload=table==='exchange_rate_snapshots'
          ? "(SELECT jsonb_agg(jsonb_set(item,'{rates}',(item->>'rates')::jsonb)) FROM jsonb_array_elements($1::jsonb) item)"
          : '$1::jsonb';
        const typed=`SELECT ${fields} FROM jsonb_populate_recordset(NULL::public."${table}",${payload})`;
        const inserted=await client.query(`INSERT INTO public."${table}" (${fields}) ${typed}`,[json]);
        if(inserted.rowCount!==Math.min(500,rows.length-offset)) fail('MIGRATION_COUNT_MISMATCH');
        const {rows:[check]}=await client.query(`WITH expected AS (${typed}),
          actual AS (SELECT ${fields} FROM public."${table}" WHERE id IN (SELECT id FROM expected))
          SELECT COUNT(*)::int AS n FROM (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual) difference`,[json]);
        if(check.n!==0) fail('MIGRATION_RECONCILIATION_FAILED');
      }
      const {rows:[count]}=await client.query(`SELECT COUNT(*)::text AS count FROM public."${table}"`);
      if(count.count!==String(rows.length)) fail('MIGRATION_COUNT_MISMATCH');
      // ALTER ... RESTART is transactional, unlike setval().
      await client.query(`ALTER TABLE public."${table}" ALTER COLUMN id RESTART WITH ${next.toString()}`);
      counts[table]=rows.length;
    }
    await requireReady(client);
    await client.query(args['--apply']?'COMMIT':'ROLLBACK');
    return {success:true,status:args['--apply']?'MIGRATED':'DRY_RUN_ROLLED_BACK',counts};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }
},async()=>{if(client)await client.end();});
