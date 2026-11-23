import { randomBytes } from 'node:crypto';
import { parseArgs } from './migrationSnapshot.js';
import { operationError, runOperation } from './databaseOperations.js';

const fail=code=>{throw operationError(code);};
await runOperation(async()=>{
  const args=parseArgs(process.argv.slice(2),['--url','--confirm-host','--deployment','--revision','--origin','--exchange'],['--exercise-writes','--local']);
  let url,origin;
  try {url=new URL(args['--url']);origin=new URL(args['--origin']);} catch {fail('INVALID_SMOKE_URL');}
  const local=args['--local']===true;
  if(url.origin!==args['--url']||url.host!==args['--confirm-host']||
    (local ? url.protocol!=='http:'||url.hostname!=='127.0.0.1' : url.protocol!=='https:'||!url.hostname.endsWith('.onrender.com')||!!url.port)||
    origin.origin!==args['--origin']||!['https:','http:'].includes(origin.protocol)||
    !/^[a-f0-9]{40}$/.test(args['--revision'])||!/^s17-[a-z0-9-]{1,60}$/.test(args['--deployment'])||
    !['disabled','frankfurter'].includes(args['--exchange'])) fail('INVALID_SMOKE_TARGET');
  const checks=[];
  const request=async(path,code,options={})=>{
    let result;
    try {result=await fetch(url.origin+'/api'+path,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});} catch {fail('SMOKE_NETWORK_FAILURE');}
    if(result.status!==code) fail('SMOKE_HTTP_'+result.status+'_EXPECTED_'+code);
    let body;
    if(code!==204) {try{body=await result.json();}catch{fail('SMOKE_INVALID_RESPONSE');}}
    return {body,headers:result.headers};
  };
  const assert=(condition,code)=>{if(!condition)fail(code);};
  const stage=await request('/staging-info',200);
  assert(stage.body.environment==='staging'&&stage.body.deployment===args['--deployment']&&stage.body.revision===args['--revision'],'SMOKE_DEPLOYMENT_IDENTITY_MISMATCH');
  checks.push('staging_identity');
  assert((await request('/health',200)).body.status==='OK','SMOKE_HEALTH_FAILED');
  assert((await request('/ready',200)).body.status==='READY','SMOKE_DATABASE_NOT_READY');
  checks.push('health_and_database');
  const headers={Origin:origin.origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'};
  assert((await request('/auth/login',204,{method:'OPTIONS',headers})).headers.get('access-control-allow-origin')===origin.origin,'SMOKE_CORS_ALLOW_FAILED');
  assert(!(await request('/health',200,{headers:{Origin:'https://untrusted.example.invalid'}})).headers.get('access-control-allow-origin'),'SMOKE_CORS_DENY_FAILED');
  checks.push('cors_allow_and_deny');
  const {body:list}=await request('/cars',200);
  const fixture=list.cars?.find(c=>c.vin==='S17SEED0000000002'&&c.name==='S17_SYNTHETIC_SEED_V1 Synthetic SUV'&&c.is_available===true);
  assert(Number.isSafeInteger(fixture?.id)&&fixture.price===68000000,'SMOKE_SYNTHETIC_INVENTORY_MISSING');
  assert((await request('/cars/'+fixture.id,200)).body.car?.vin===fixture.vin,'SMOKE_INVENTORY_DETAIL_FAILED');
  await request('/bookings/my-bookings',401);
  await request('/admin/stats',401);
  checks.push('inventory_and_unauthenticated_denial');
  if(args['--exchange']==='disabled') {
    const rates=await request('/exchange-rates?baseCurrency=UGX',503);
    assert(rates.body.success===false,'SMOKE_DISABLED_RATES_FAILED');
    checks.push('disabled_exchange_rate_contract');
  } else {
    const {body:first}=await request('/exchange-rates?baseCurrency=UGX',200);
    const {body:second}=await request('/exchange-rates?baseCurrency=UGX',200);
    assert(first.provider==='frankfurter'&&first.rates?.UGX===1&&first.rates.USD>0&&second.source==='database_cache','SMOKE_REFERENCE_RATE_FAILED');
    checks.push('reference_exchange_rate_cache');
  }
  if(!args['--exercise-writes']) return {success:true,status:'READ_ONLY_PASSED',checks};
  // Only after exact staging identity and fixture checks; never reuse real credentials.
  const suffix=randomBytes(10).toString('hex');
  const email='s17-smoke-'+suffix+'@example.invalid';
  const password=randomBytes(24).toString('hex');
  const json=(body,token)=>({method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const registration=await request('/auth/register',201,json({name:'S17 Synthetic Smoke '+suffix,email,password}));
  const login=await request('/auth/login',200,json({email,password}));
  assert(registration.body.user?.id===login.body.user?.id&&typeof login.body.token==='string'&&login.body.user?.role==='user','SMOKE_AUTH_FAILED');
  const auth={Authorization:'Bearer '+login.body.token};
  await request('/admin/stats',403,{headers:auth});
  checks.push('registration_login_and_rbac');
  const day=new Date();day.setUTCDate(day.getUTCDate()+3);if(day.getUTCDay()===0)day.setUTCDate(day.getUTCDate()+1);
  const booking_date=day.toISOString().slice(0,10);
  const slots=(await request('/bookings/available-slots/'+fixture.id+'/'+booking_date,200)).body.availableSlots;
  assert(Array.isArray(slots)&&slots.length>0,'SMOKE_NO_SYNTHETIC_SLOTS');
  const booking={car_id:fixture.id,booking_date,time_slot:slots[0],notes:'S17_SYNTHETIC_SMOKE_'+suffix};
  let id;
  try {
    const created=(await request('/bookings/create',201,json(booking,login.body.token))).body.booking;
    id=created?.id;
    assert(Number.isSafeInteger(id),'SMOKE_BOOKING_ID_INVALID');
    await request('/bookings/create',409,json(booking,login.body.token));
    const own=(await request('/bookings/my-bookings',200,{headers:auth})).body.bookings;
    assert(own?.some(row=>row.id===id),'SMOKE_BOOKING_PERSISTENCE_FAILED');
    checks.push('booking_create_duplicate_and_read');
  } finally {
    if(Number.isSafeInteger(id)) {
      const cancelled=(await request('/bookings/'+id+'/cancel',200,{method:'DELETE',headers:auth})).body.booking;
      assert(cancelled?.status==='cancelled','SMOKE_BOOKING_CANCEL_FAILED');
      checks.push('booking_cancel');
    }
  }
  return {success:true,status:'STAGING_WRITE_SMOKE_PASSED',checks};
});
