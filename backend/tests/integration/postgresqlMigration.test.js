import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { buildPoolConfig } from '../../config/databasePoolConfig.js';

const exec=promisify(execFile);
const cwd=fileURLToPath(new URL('../../',import.meta.url));
const first=process.env.S17_NATIVE_MIGRATION_DATABASE_URL;
const second=process.env.S17_NATIVE_MIGRATION_PG_TARGET_URL;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const timestamp='2026-09-01 12:34:56';
const email='p6-user@example.invalid';
const password='p6-only-synthetic-password';
const envFor=url=>{
  const env={...process.env,NODE_ENV:'test',TEST_DATABASE_URL:url};
  delete env.DATABASE_URL;
  return env;
};
async function cli(script,args,env) {
  try {
    const {stdout,stderr}=await exec(process.execPath,[script,...args],{cwd,env,timeout:18000});
    return {code:0,result:JSON.parse(stdout),output:stdout+stderr};
  } catch(error) {
    return {code:error.code,output:(error.stdout??'')+(error.stderr??'')};
  }
}
async function connect(url) {
  const config=buildPoolConfig(envFor(url));
  assert.ok(['127.0.0.1','localhost','::1'].includes(config.host));
  assert.match(config.database,/^cardealership_s17_test_p6[a-z0-9]+$/);
  const client=new pg.Client(config);
  await client.connect();
  assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
  return {client,config};
}
test('legacy SQLite and PostgreSQL snapshot migration, recovery and reconciliation', {skip:!first||!second,timeout:90000},async t=>{
  assert.notEqual(first,second);
  const {DatabaseSync}=await import('node:sqlite');
  const dir=await mkdtemp(join(tmpdir(),'s17-p6-fixture-'));
  const sqlitePath=join(dir,'legacy.sqlite');
  const exportPath=join(dir,'legacy.json');
  const db=new DatabaseSync(sqlitePath);
  // Contract reconstructed from the verified P1 config/db.js (older brand-only cars).
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT DEFAULT 'user',created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE cars(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,brand TEXT,price REAL,year INTEGER,status TEXT DEFAULT 'available',image_url TEXT,description TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE car_specs(id INTEGER PRIMARY KEY AUTOINCREMENT,car_id INTEGER NOT NULL UNIQUE,power TEXT,engine TEXT,drive TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE);
    CREATE TABLE car_images(id INTEGER PRIMARY KEY AUTOINCREMENT,car_id INTEGER NOT NULL,image_url TEXT NOT NULL,image_type TEXT NOT NULL DEFAULT 'general',created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE);
    CREATE TABLE bookings(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,car_id INTEGER NOT NULL,booking_date TEXT NOT NULL,time_slot TEXT NOT NULL,notes TEXT,status TEXT DEFAULT 'pending',created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE);
    CREATE UNIQUE INDEX uniq_booking ON bookings(car_id,booking_date,time_slot) WHERE status NOT IN ('cancelled','completed');`);
  const hash=await bcrypt.hash(password,10);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(7,'P6 Fixture User',email,hash,'user',timestamp);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(99,'Deleted fixture','deleted@example.invalid',hash,'user',timestamp);
  db.exec('DELETE FROM users WHERE id=99');
  db.prepare('INSERT INTO cars VALUES (?,?,?,?,?,?,?,?,?)').run(20,'Legacy Fixture', 'Toyota',12500.25,2020,'Available','https://example.invalid/car.webp','synthetic',timestamp);
  db.prepare('INSERT INTO car_specs VALUES (?,?,?,?,?,?,?)').run(31,20,'150 hp','2L','FWD',timestamp,timestamp);
  db.prepare('INSERT INTO car_images VALUES (?,?,?,?,?)').run(41,20,'https://example.invalid/gallery.webp','general',timestamp);
  for(const [id,status] of [[51,'cancelled'],[52,'confirmed']]) db.prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?)').run(id,7,20,'2026-09-03','09:00-10:00','fixture',status,timestamp,timestamp);
  db.close();
  const sourceDigest=sha(await readFile(sqlitePath));
  const a=await connect(first);
  const b=await connect(second);
  const empty=async client=>assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
  const exportArgs=['sqlite','--source',sqlitePath,'--out',exportPath,'--assume-utc'];
  let snapshot,digest;
  const migrate=(target,file=exportPath,hash=digest,apply=false,extra={})=>cli('scripts/migrateLegacySnapshot.js',['--confirm',target.config.database,'--file',file,'--sha256',hash,...(apply?['--apply']:[])],{...envFor(target===a?first:second),...extra});
  async function variant(name,change) {
    const copy=structuredClone(snapshot);change(copy);
    const file=join(dir,name+'.json'),bytes=Buffer.from(JSON.stringify(copy));
    await writeFile(file,bytes,{mode:0o600,flag:'wx'});
    return [file,sha(bytes)];
  }
  try {
    await t.test('read-only SQLite export, explicit UTC policy and private digest',async()=>{
      const noPolicy=await cli('scripts/exportMigrationSnapshot.js',exportArgs.slice(0,-1),envFor(first));
      assert.match(noPolicy.output,/EXPLICIT_TIMESTAMP_POLICY_REQUIRED/);
      const exported=await cli('scripts/exportMigrationSnapshot.js',exportArgs,envFor(first));
      assert.equal(exported.code,0,exported.output);
      assert.deepEqual(exported.result.counts,{users:1,cars:1,car_specs:1,car_images:1,bookings:2});
      const bytes=await readFile(exportPath);digest=sha(bytes);snapshot=JSON.parse(bytes);
      assert.equal(exported.result.sha256,digest);
      assert.equal(snapshot.tables.users.highWater,'99');
      assert.equal(sourceDigest,sha(await readFile(sqlitePath)));
      assert.ok(!exported.output.includes(email));
      assert.notEqual((await cli('scripts/exportMigrationSnapshot.js',exportArgs,envFor(first))).code,0,'must not overwrite snapshot');
    });
    await t.test('checksum, production guard and unknown source schema fail closed',async()=>{
      assert.match((await migrate(a,exportPath,'0'.repeat(64),true)).output,/SNAPSHOT_DIGEST_MISMATCH/);
      assert.match((await migrate(a,exportPath,digest,true,{NODE_ENV:'production'})).output,/MUTATION_ENVIRONMENT_FORBIDDEN/);
      const args=await variant('extra',s=>{s.tables.unmapped={columns:['id'],highWater:'1',rows:[{id:'1'}]};});
      assert.match((await migrate(a,...args,true)).output,/INVALID_SOURCE_SNAPSHOT/);
      await empty(a.client);
    });
    await t.test('actual source corruption or unmapped tables block export',async()=>{
      for(const [name,mutate,code] of [
        ['unknown',db=>db.exec('CREATE TABLE sqliteX_unmapped(id INTEGER)'),'UNMAPPED_SOURCE_SCHEMA'],
        ['orphan',db=>{db.exec('PRAGMA foreign_keys=OFF; UPDATE bookings SET car_id=999 WHERE id=52;');},'SOURCE_INTEGRITY_FAILED'],
      ]) {
        const copy=join(dir,name+'.sqlite');
        await copyFile(sqlitePath,copy);
        const fixture=new DatabaseSync(copy);
        mutate(fixture);fixture.close();
        const result=await cli('scripts/exportMigrationSnapshot.js',['sqlite','--source',copy,'--out',join(dir,name+'-export.json'),'--assume-utc'],envFor(first));
        assert.match(result.output,new RegExp(code));
        assert.equal(result.code,1);
      }
    });
    await t.test('case-insensitive duplicates, orphans and lossy decimal conversion roll back all DDL',async()=>{
      const duplicate=await variant('duplicate',s=>s.tables.users.rows.push({...s.tables.users.rows[0],id:'8',email:email.toUpperCase()}));
      const duplicateResult=await migrate(a,...duplicate,true);
      assert.match(duplicateResult.output,/23505/);assert.ok(!duplicateResult.output.includes(email));await empty(a.client);
      const orphan=await variant('orphan',s=>{s.tables.bookings.rows[1].car_id='999';});
      assert.match((await migrate(a,...orphan,true)).output,/23503/);await empty(a.client);
      const decimal=await variant('decimal',s=>{s.tables.cars.rows[0].price='12500.251';});
      assert.match((await migrate(a,...decimal,true)).output,/SOURCE_DECIMAL_REQUIRES_REVIEW/);await empty(a.client);
      const conflict=await variant('makeConflict',s=>{s.tables.cars.columns.push('make');s.tables.cars.rows[0].make='Conflicting make';});
      assert.match((await migrate(a,...conflict,true)).output,/SOURCE_MAKE_BRAND_CONFLICT/);await empty(a.client);
      const doubleBooking=await variant('doubleBooking',s=>{s.tables.bookings.rows[0].status='confirmed';});
      assert.match((await migrate(a,...doubleBooking,true)).output,/23505/);await empty(a.client);
    });
    await t.test('two dry runs leave target empty; explicit commit preserves source evidence',async()=>{
      for(let i=0;i<2;i++) {
        const result=await migrate(a);assert.equal(result.result?.status,'DRY_RUN_ROLLED_BACK',result.output);await empty(a.client);
      }
      const result=await migrate(a,exportPath,digest,true);
      assert.equal(result.result?.status,'MIGRATED',result.output);
      assert.deepEqual(result.result.counts,{users:1,cars:1,car_specs:1,car_images:1,bookings:2,financing_leads:0,exchange_rate_snapshots:0,vehicle_spotlights:0});
      const {rows:[user]}=await a.client.query('SELECT id,email,password,created_at FROM users');
      assert.equal(user.id,7);assert.equal(user.email,email);assert.equal(user.password,hash);
      assert.equal(await bcrypt.compare(password,user.password),true);
      assert.equal(user.created_at.toISOString(),'2026-09-01T12:34:56.000Z');
      const {rows:[car]}=await a.client.query('SELECT id,brand,make,price,status,is_available FROM cars');
      assert.deepEqual(car,{id:20,brand:'Toyota',make:'Toyota',price:'12500.25',status:'available',is_available:true});
      assert.equal((await a.client.query('SELECT image_url FROM car_images')).rows[0].image_url,'https://example.invalid/gallery.webp');
      assert.equal((await a.client.query('SELECT count(*)::int AS n FROM bookings WHERE car_id=20 AND user_id=7')).rows[0].n,2);
      assert.match((await migrate(a,exportPath,digest,true)).output,/MIGRATION_REQUIRES_EMPTY_TARGET/);
      assert.equal((await a.client.query("INSERT INTO users(name,email,password) VALUES('Next fixture','next@example.invalid',$1) RETURNING id",[hash])).rows[0].id,100);
      assert.equal(sourceDigest,sha(await readFile(sqlitePath)));
    });
    await t.test('export and import a PostgreSQL clone including all eight domains, bigint and precision',async()=>{
      await a.client.query(`INSERT INTO financing_leads(id,reference_code,idempotency_key,car_id,user_id,customer_name,customer_phone,vehicle_price_snapshot,down_payment,loan_amount,annual_interest_rate,loan_term_months,monthly_payment,total_payment,total_interest,contact_consent,created_at)
      VALUES(9007199254740993,'REF-P6','KEY-P6',20,7,'Fixture','0000000',12500.25,2500.25,10000,2.375,12,850.50,10206,206,true,'2026-09-01T12:34:56.123456Z')`);
      await a.client.query("INSERT INTO exchange_rate_snapshots(id,base_currency,rates,provider,retrieved_at,observed_at,expires_at) VALUES(9007199254740995,'UGX','{\"UGX\":1,\"USD\":0.00027}','fixture','2026-09-01T12:00:00Z','2026-09-01T11:00:00Z','2026-09-02T12:00:00Z')");
      await a.client.query("INSERT INTO vehicle_spotlights(id,car_id,score,tier,reason,is_read) VALUES(91,20,88,'Gold','Fixture',true)");
      await a.client.query('ALTER TABLE financing_leads ALTER COLUMN id RESTART WITH 9007199254741000');
      const file=join(dir,'pg.json');
      const exported=await cli('scripts/exportMigrationSnapshot.js',['postgresql','--confirm',a.config.database,'--out',file,'--assume-utc'],envFor(first));
      assert.equal(exported.code,0,exported.output);
      const hash=exported.result.sha256;
      const dryRun=await migrate(b,file,hash);
      assert.equal(dryRun.result?.status,'DRY_RUN_ROLLED_BACK',dryRun.output);await empty(b.client);
      const result=await migrate(b,file,hash,true);
      assert.equal(result.result?.status,'MIGRATED',result.output);
      assert.deepEqual(result.result.counts,{users:2,cars:1,car_specs:1,car_images:1,bookings:2,financing_leads:1,exchange_rate_snapshots:1,vehicle_spotlights:1});
      for(const table of Object.keys(result.result.counts)) {
        const sql=`SELECT to_jsonb(t)::text AS row FROM public."${table}" t ORDER BY id`;
        assert.deepEqual((await a.client.query(sql)).rows,(await b.client.query(sql)).rows,table);
      }
      assert.equal((await b.client.query("SELECT id::text,annual_interest_rate::text, to_char(created_at AT TIME ZONE 'UTC','US') AS micros FROM financing_leads")).rows[0].micros,'123456');
      assert.equal((await b.client.query("SELECT nextval(pg_get_serial_sequence('financing_leads','id'))::text AS id")).rows[0].id,'9007199254741000');
      assert.equal((await b.client.query("SELECT nextval(pg_get_serial_sequence('exchange_rate_snapshots','id'))::text AS id")).rows[0].id,'9007199254740996');
      assert.equal((await b.client.query('SELECT id::text FROM exchange_rate_snapshots')).rows[0].id,'9007199254740995');
    });
    await t.test('actual API reads migrated inventory and authenticates the preserved account',async()=>{
      const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
      const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
      const child=spawn(process.execPath,['server.js'],{cwd,env:{...envFor(second),JWT_SECRET:'synthetic-p6-only-secret',EXCHANGE_RATE_PROVIDER:'disabled',PORT:String(port)},stdio:'ignore'});
      const exited=once(child,'exit');
      const origin=`http://127.0.0.1:${port}/api`;
      const request=(path,options={})=>fetch(origin+path,{...options,signal:AbortSignal.timeout(3000)});
      try {
        for(let i=0;i<50;i++) {
          try {if((await request('/health')).status===200)break;}catch{}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        assert.equal((await request('/ready')).status,200);
        const login=await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
        assert.equal(login.status,200);
        const {token}=await login.json();assert.ok(token);
        const detail=await request('/cars/20');assert.equal(detail.status,200);
        const {car}=await detail.json();assert.equal(car.id,20);assert.equal(car.make,'Toyota');assert.equal(car.price,12500.25);
        const bookings=await request('/bookings/my-bookings',{headers:{Authorization:'Bearer '+token}});
        assert.equal(bookings.status,200);
        assert.equal((await bookings.json()).bookings.length,2);
        assert.equal((await request('/admin/stats',{headers:{Authorization:'Bearer '+token}})).status,403);
      } finally {child.kill('SIGTERM');assert.deepEqual(await exited,[0,null]);}
    });
  } finally {await a.client.end();await b.client.end();}
});
