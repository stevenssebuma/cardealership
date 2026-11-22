import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { buildPoolConfig } from '../../config/databasePoolConfig.js';

const url = process.env.S17_NATIVE_TEST_DATABASE_URL;
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
async function port() {
  const s = net.createServer();
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return p;
}
test('PostgreSQL operational safety and real API readiness', { skip: !url, timeout: 50000 }, async t => {
  const config = buildPoolConfig({ NODE_ENV: 'test', TEST_DATABASE_URL: url });
  assert.ok(['localhost','127.0.0.1','::1'].includes(config.host));
  assert.match(config.database, /^cardealership_s17_test(?:_[a-z0-9]+)?$/);
  const client = new pg.Client(config);
  await client.connect();
  const env = { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: url, JWT_SECRET: 'synthetic-p5-secret',
    EXCHANGE_RATE_PROVIDER: 'disabled', CORS_ALLOWED_ORIGINS: 'https://staging.example.invalid' };
  for (const key of ['DATABASE_URL','ADMIN_EMAIL','ADMIN_PASSWORD','ADMIN_NAME']) delete env[key];
  const confirmation = ['--confirm', config.database];
  async function cli(file, args = [], extra = {}) {
    try {
      const { stdout, stderr } = await exec(process.execPath, [file,...args], { cwd, env: {...env,...extra}, timeout: 12000 });
      return { code: 0, output: stdout + stderr, result: JSON.parse(stdout) };
    } catch (error) {
      return { code: error.code, output: (error.stdout ?? '') + (error.stderr ?? '') };
    }
  }
  let child;
  const p = await port();
  async function request(path, origin) {
    return fetch(`http://127.0.0.1:${p}/api/${path}`, { headers: origin ? { Origin: origin } : {}, signal: AbortSignal.timeout(3000) });
  }
  try {
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
    child = spawn(process.execPath, ['server.js'], { cwd, env: {...env, PORT: String(p)}, stdio: 'ignore' });
    const exited = once(child, 'exit');
    for (let i=0;i<50;i++) {
      try { if ((await request('health')).status === 200) break; } catch {}
      await new Promise(resolve => setTimeout(resolve,100));
    }
    await t.test('liveness independent of schema; readiness redacts details', async () => {
      assert.equal((await request('health')).status, 200);
      const response = await request('ready');
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {success:false,status:'NOT_READY'});
      assert.equal((await cli('check-db.js')).code, 1);
      assert.equal((await cli('test-db.js')).code, 0);
    });
    await t.test('wrong target, production and nonempty unknown schema cannot initialize', async () => {
      assert.match((await cli('scripts/initDb.js',['--confirm','wrong'])).output,/EXACT_DATABASE_CONFIRMATION_REQUIRED/);
      assert.match((await cli('scripts/initDb.js',confirmation,{NODE_ENV:'production'})).output,/MUTATION_ENVIRONMENT_FORBIDDEN/);
      await client.query('CREATE TABLE p5_probe (id integer)');
      assert.match((await cli('scripts/initDb.js',confirmation)).output,/NONEMPTY_DATABASE_REQUIRES_REVIEWED_MIGRATION/);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,1);
      await client.query('DROP TABLE p5_probe');
    });
    await t.test('explicit bootstrap is atomic and repeatable; ready only on complete schema', async () => {
      assert.equal((await cli('scripts/initDb.js',confirmation)).result?.status,'INITIALIZED');
      assert.equal((await cli('scripts/initDb.js',confirmation)).result?.status,'ALREADY_INITIALIZED');
      const response = await request('ready');
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{success:true,status:'READY'});
      assert.equal((await request('ready','https://staging.example.invalid')).headers.get('access-control-allow-origin'),'https://staging.example.invalid');
      assert.equal((await request('ready','https://untrusted.example.invalid')).headers.get('access-control-allow-origin'),null);
      await client.query('DROP INDEX public.idx_cars_make');
      assert.equal((await request('ready')).status,503);
      assert.equal((await cli('scripts/ensureCarSearchIndexes.js')).code,1);
      await client.query('CREATE INDEX idx_cars_make ON public.cars(make)');
      assert.equal((await request('ready')).status,200);
    });
    await t.test('synthetic seed is idempotent and isolated', async () => {
      assert.equal((await cli('seed.js')).code,1);
      assert.deepEqual((await cli('seed.js',confirmation)).result?.inserted,{users:1,cars:2,car_specs:2,bookings:1});
      assert.deepEqual((await cli('seed.js',confirmation)).result?.inserted,{users:0,cars:0,car_specs:0,bookings:0});
      const { rows } = await client.query("SELECT email,role,password FROM users");
      assert.equal(rows.length,1);
      assert.equal(rows[0].email,'s17-seed-user@example.invalid');
      assert.equal(rows[0].role,'user');
      assert.match(rows[0].password,/^\$2[aby]\$/);
      assert.equal(await bcrypt.compare('admin123',rows[0].password),false);
    });
    await t.test('admin provisioning demands credentials, rotates only admin, never logs passwords', async () => {
      const first = 'synthetic-password-one';
      const second = 'synthetic-password-two';
      const email = 'p5-admin@example.invalid';
      assert.match((await cli('reset-admin.js',confirmation)).output,/ADMIN_CREDENTIALS_INVALID/);
      assert.match((await cli('reset-admin.js',confirmation,{ADMIN_EMAIL:'s17-seed-user@example.invalid',ADMIN_PASSWORD:first})).output,/NON_ADMIN_ACCOUNT_COLLISION/);
      for (const [password,status] of [[first,'CREATED'],[second,'ROTATED']]) {
        const result = await cli('reset-admin.js',confirmation,{ADMIN_EMAIL:email,ADMIN_PASSWORD:password});
        assert.equal(result.result?.status,status);
        assert.ok(!result.output.includes(password));
        const {rows:[row]} = await client.query('SELECT password,role FROM users WHERE email=$1',[email]);
        assert.equal(row.role,'admin');
        assert.equal(await bcrypt.compare(password,row.password),true);
        if (status==='ROTATED') assert.equal(await bcrypt.compare(first,row.password),false);
      }
    });
    await t.test('read-only diagnostics and graceful shutdown', async () => {
      const check=await cli('check-db.js');
      assert.equal(check.code,0);
      assert.equal(Object.keys(check.result.counts).length,8);
      assert.equal(check.result.counts.users,'2');
      assert.equal((await cli('scripts/ensureCarSearchIndexes.js')).code,0);
      child.kill('SIGTERM');
      assert.deepEqual(await exited,[0,null]);
    });
  } finally {
    if (child && child.exitCode===null && child.signalCode===null) child.kill('SIGTERM');
    await client.end();
  }
});

test('API rejects missing config and retains liveness when PostgreSQL is unreachable', {timeout:15000}, async () => {
  const unavailable = await port();
  const p = await port();
  const env = {...process.env, NODE_ENV:'test', TEST_DATABASE_URL:`postgresql://fixture@127.0.0.1:${unavailable}/cardealership_s17_test_unreachable`,
    DB_CONNECT_TIMEOUT_MS:'200', JWT_SECRET:'synthetic-p5-secret', EXCHANGE_RATE_PROVIDER:'disabled', PORT:String(p)};
  delete env.DATABASE_URL;
  await assert.rejects(exec(process.execPath,['server.js'],{cwd,env:{...env,JWT_SECRET:''},timeout:4000}),
    error => error.code===1 && error.stderr.includes('API configuration invalid'));
  const child=spawn(process.execPath,['server.js'],{cwd,env,stdio:'ignore'});
  const exited=once(child,'exit');
  try {
    const base=`http://127.0.0.1:${p}/api`;
    for (let i=0;i<40;i++) {
      try { if ((await fetch(base+'/health',{signal:AbortSignal.timeout(200)})).status===200) break; } catch {}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal((await fetch(base+'/health')).status,200);
    const response=await fetch(base+'/ready',{signal:AbortSignal.timeout(3000)});
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{success:false,status:'NOT_READY'});
  } finally {
    child.kill('SIGTERM');
    assert.deepEqual(await exited,[0,null]);
  }
});
