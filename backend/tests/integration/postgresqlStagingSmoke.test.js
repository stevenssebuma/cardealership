import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {buildPoolConfig} from '../../config/databasePoolConfig.js';

const url=process.env.S17_NATIVE_STAGING_DATABASE_URL;
const exec=promisify(execFile);
const cwd=fileURLToPath(new URL('../../',import.meta.url));
test('staging release smoke with real PostgreSQL and exact identity verification',{skip:!url,timeout:45000},async t=>{
  const parsed=new URL(url);
  const dbName=parsed.pathname.slice(1);
  assert.match(dbName,/^cardealership_s17_staging_[a-z0-9]+$/);
  assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));
  const revision='a'.repeat(40),deployment='s17-panda-staging-fixture';
  const env={...process.env,NODE_ENV:'staging',DATABASE_URL:url,STAGING_DATABASE_NAME:dbName,
    STAGING_DEPLOYMENT_ID:deployment,STAGING_SOURCE_REVISION:revision,
    JWT_SECRET:'s17-local-staging-fixture-secret-2026-valid',EXCHANGE_RATE_PROVIDER:'disabled',CORS_ALLOWED_ORIGINS:'http://localhost:5173',TZ:'UTC'};
  delete env.TEST_DATABASE_URL;delete env.RENDER;
  const client=new pg.Client(buildPoolConfig(env));await client.connect();
  let child;
  async function run(script,args=[]){try{const {stdout,stderr}=await exec(process.execPath,[script,...args],{cwd,env,timeout:18000});return{code:0,result:JSON.parse(stdout),output:stdout+stderr};}catch(error){return{code:error.code,output:(error.stdout??'')+(error.stderr??'')};}}
  try {
    assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
    assert.equal((await run('scripts/initDb.js',['--confirm',dbName])).code,0);
    assert.equal((await run('seed.js',['--confirm',dbName])).code,0);
    const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
    const p=socket.address().port;await new Promise(resolve=>socket.close(resolve));
    const base='http://127.0.0.1:'+p;
    child=spawn(process.execPath,['server.js'],{cwd,env:{...env,PORT:String(p)},stdio:'ignore'});
    for(let i=0;i<50;i++){try{if((await fetch(base+'/api/health')).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    const args=['--url',base,'--confirm-host','127.0.0.1:'+p,'--deployment',deployment,'--revision',revision,'--origin','http://localhost:5173','--exchange','disabled','--local'];
    await t.test('wrong deployment revision blocks all writes',async()=>{
      const wrong=[...args];wrong[wrong.indexOf('--revision')+1]='b'.repeat(40);
      assert.match((await run('scripts/stagingSmoke.js',[...wrong,'--exercise-writes'])).output,/SMOKE_DEPLOYMENT_IDENTITY_MISMATCH/);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n,1);
    });
    await t.test('read-only smoke performs no data writes',async()=>{
      const result=await run('scripts/stagingSmoke.js',args);
      assert.equal(result.result?.status,'READ_ONLY_PASSED',result.output);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n,1);
    });
    await t.test('write smoke validates auth, RBAC, booking conflict and cancel',async()=>{
      const result=await run('scripts/stagingSmoke.js',[...args,'--exercise-writes']);
      assert.equal(result.result?.status,'STAGING_WRITE_SMOKE_PASSED',result.output);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE email LIKE 's17-smoke-%@example.invalid'")).rows[0].n,1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM bookings WHERE notes LIKE 'S17_SYNTHETIC_SMOKE_%' AND status='cancelled'")).rows[0].n,1);
    });
  } finally {
    if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');assert.deepEqual(await ended,[0,null]);}
    await client.end();
  }
});
