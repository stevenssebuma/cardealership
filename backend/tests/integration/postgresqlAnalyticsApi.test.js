import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import pg from 'pg';
import { buildPoolConfig } from '../../config/databasePoolConfig.js';
import db from '../../config/db.js';
import { signToken } from '../../utils/jwt.js';
import carsRoutes from '../../routes/carsRoutes.js';
import optimizedRoutes from '../../routes/optimizedRoutes.js';
import adminMetricsRoutes from '../../routes/adminMetricsRoutes.js';
import reportRoutes from '../../routes/reportRoutes.js';
import highValueRoutes from '../../routes/highValueRoutes.js';
import { createHighValueAlertSystem } from '../../controllers/highValueController.js';
import { queryOptimizer } from '../../utils/dbOptimizer.js';
import { inspectIndexes, verifyIndexes } from '../../config/indexes.js';

const url = process.env.S17_NATIVE_TEST_DATABASE_URL;
const vehicle = { vin:'1HGCM82633A004352', make:'Toyota',model:'Land Cruiser',name:'P4B2 Land Cruiser',type:'SUV',category:'SUV', year:2022,price:300000000,
  mileage:5000,color:'White',condition:'New',status:'Available',power:'150 hp',engine:'2.0 L',drive:'4WD',transmission:'Automatic',fuelType:'Diesel' };

test('native PostgreSQL analytics, reporting and spotlight route graph', {
  skip:!url?'Set S17_NATIVE_TEST_DATABASE_URL and TEST_DATABASE_URL to one fresh disposable loopback database.':false, timeout:45000,
}, async t => {
  const config=buildPoolConfig({NODE_ENV:'test',TEST_DATABASE_URL:url});
  assert.equal(process.env.NODE_ENV,'test');
  assert.equal(process.env.TEST_DATABASE_URL,url);
  assert.ok(['127.0.0.1','localhost','::1'].includes(config.host));
  assert.match(config.database,/^cardealership_s17_test(?:_[a-z0-9]+)?$/);
  const bootstrap=new pg.Client(config);
  await bootstrap.connect();
  let server;
  try {
    assert.equal((await bootstrap.query('SELECT current_database() AS name')).rows[0].name,config.database);
    assert.equal(Number((await bootstrap.query("SELECT count(*) AS n FROM pg_catalog.pg_tables WHERE schemaname='public'")).rows[0].n),0,'Refusing nonempty database');
    const schema=await readFile(new URL('../../scripts/schema.sql',import.meta.url),'utf8');
    await bootstrap.query(schema);
    await bootstrap.query(schema);
    const app=express(); app.use(express.json());
    // Exercise real previously unmounted routers, without changing the canonical server's public surface.
    app.use('/cars',carsRoutes); app.use('/optimized',optimizedRoutes); app.use('/metrics',adminMetricsRoutes); app.use('/reports',reportRoutes); app.use('/spotlight',highValueRoutes);
    server=app.listen(0,'127.0.0.1'); await once(server,'listening');
    const request=async(method,path,token,body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{ method,signal:AbortSignal.timeout(10000),headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}) });
    const expect=async(status,...args)=>{const res=await request(...args); const body=await res.json(); assert.equal(res.status,status,`${args[0]} ${args[1]}: ${JSON.stringify(body).slice(0,300)}`); return body;};
    let admin,user,carId,otherId,draftId,day;
    await t.test('fresh bootstrap contains no fake data; real indexes are valid',async()=>{
      for(const name of ['users','cars','bookings','vehicle_spotlights']) assert.equal(Number((await db.query(`SELECT count(*) AS n FROM ${name}`)).rows[0].n),0);
      assert.deepEqual(await inspectIndexes(db),{verified:true,missing:[]});
      assert.equal(await verifyIndexes(db),true);
      assert.deepEqual((await expect(200,'GET','/optimized/search')).data,[]);
      const searchMetrics=await expect(200,'GET','/optimized/most-searched');
      assert.deepEqual(searchMetrics.data,[]); assert.equal(searchMetrics.meta.available,false);
      await expect(401,'GET','/metrics'); await expect(401,'GET','/reports/inventory/json'); await expect(401,'GET','/spotlight/alerts');
    });
    await t.test('canonical car API persists optional filters and search paginates real inventory',async()=>{
      const users=(await db.query("INSERT INTO users(name,email,password,role) VALUES ('Synthetic admin','p4b2-admin@example.invalid','unused','admin'),('Synthetic user','p4b2-user@example.invalid','unused','user') RETURNING id,role")).rows;
      admin=signToken({id:users[0].id,role:'admin'}); user=signToken({id:users[1].id,role:'user'});
      carId=(await expect(201,'POST','/cars',admin,vehicle)).car.id;
      otherId=(await expect(201,'POST','/cars',admin,{...vehicle,vin:'1HGCM82633A004353',make:'Honda',model:'Accord',name:'P4B2 Accord',price:12500.25,condition:'Used',fuelType:'Petrol'})).car.id;
      draftId=(await db.query("INSERT INTO cars(name,make,model,status,price) VALUES('Hidden synthetic draft','Toyota','Draft','draft',100) RETURNING id")).rows[0].id;
      const updated=await expect(200,'PATCH',`/cars/${otherId}`,admin,{transmission:'Manual',fuelType:'Hybrid'});
      assert.equal(updated.car.fuelType,'Hybrid'); assert.equal(updated.car.transmission,'Manual');
      const data=await expect(200,'GET','/optimized/search?make=toyota&transmission=automatic&fuelType=diesel&minPrice=250000000');
      assert.equal(data.meta.total,1); assert.equal(data.data[0].id,carId); assert.equal(data.data[0].price,300000000);
      const paged=await expect(200,'GET','/optimized/search?limit=1&offset=1&sortBy=price&sortOrder=asc');
      assert.equal(paged.meta.total,2); assert.equal(paged.data[0].id,carId);
      const empty=await expect(200,'GET','/optimized/search?limit=1&offset=10'); assert.equal(empty.meta.total,2); assert.deepEqual(empty.data,[]);
      assert.deepEqual((await expect(200,'GET','/optimized/search?make='+encodeURIComponent("' OR 1=1 --"))).data,[]);
      await expect(400,'GET','/optimized/search?sortBy='+encodeURIComponent('price; DROP TABLE cars'));
      await expect(400,'GET','/optimized/search?minPrice=500&maxPrice=100'); await expect(400,'GET','/optimized/search?limit=101');
      await expect(400,'PATCH',`/cars/${otherId}`,admin,{fuelType:'<script>bad</script>'});
      assert.equal((await queryOptimizer.searchInventory(db,{make:'Honda',fuelType:'hybrid'}))[0].id,otherId);
      await expect(403,'GET','/metrics',user); await expect(403,'GET','/reports/inventory/json',user); await expect(403,'GET','/spotlight/alerts',user);
    });
    await t.test('availability honors active reservations and protects customer identity',async()=>{
      const dates=(await db.query("SELECT CURRENT_DATE::text AS today,(date_trunc('month',CURRENT_DATE)-interval '1 day')::date::text AS previous,(date_trunc('month',CURRENT_DATE)+interval '1 month')::date::text AS next")).rows[0];
      day=dates.today;
      const userId=(await db.query("SELECT id FROM users WHERE role='user'")).rows[0].id;
      await db.query("INSERT INTO bookings(user_id,car_id,booking_date,time_slot,status) VALUES ($1,$2,$3,'09:00-10:00','confirmed'),($1,$2,$3,'10:00-11:00','completed'),($1,$2,$4,'09:00-10:00','cancelled'),($1,$2,$5,'09:00-10:00','pending')",[userId,carId,day,dates.previous,dates.next]);
      const available=async slot=>(await expect(200,'GET',`/optimized/availability?carId=${carId}&date=${day}&timeSlot=${slot}`)).data;
      assert.deepEqual(await available('09:00-10:00'),{available:false,bookedBy:null});
      assert.deepEqual(await available('10:00-11:00'),{available:true,bookedBy:null});
      await expect(404,'GET',`/optimized/availability?carId=${draftId}&date=${day}&timeSlot=09:00-10:00`);
      await expect(400,'GET',`/optimized/availability?carId=${carId}&date=2026-02-30&timeSlot=09:00-10:00`);
      const bookings=await queryOptimizer.getBookingsByDateRange(db,day,day,'confirmed'); assert.equal(bookings.length,1); assert.equal(bookings[0].date,day);
      const [year,month]=day.split('-'); const monthly=await queryOptimizer.getMonthlyBookingStats(db,year,month); assert.equal(monthly[0].total,2);
    });
    await t.test('administrative metrics count real rows, not fabricated sales or search data',async()=>{
      const data=(await expect(200,'GET','/metrics',admin)).data;
      assert.equal(data.inventory.totalCars,3); assert.equal(data.inventory.totalValue,300012600.25);
      assert.equal(data.bookings.total,4); assert.equal(data.bookings.thisMonth,2); assert.equal(data.users.totalUsers,2);
      assert.equal(data.revenue.available,false); assert.equal(data.revenue.totalRevenue,null); assert.equal(data.revenue.totalSales,null);
      assert.equal(data.searches.available,false); assert.equal(data.searches.total,null);
      assert.equal((await expect(200,'GET','/metrics/inventory',admin)).data.totalCars,3);
      assert.equal((await expect(200,'GET','/metrics/bookings',admin)).data.byCar[vehicle.name],4);
      assert.equal((await expect(200,'GET','/optimized/stats')).data.totalCars,2);
      await expect(403,'GET','/optimized/performance',user);
      const perf=(await expect(200,'GET','/optimized/performance',admin)).data; assert.ok(perf.totalQueries>0); assert.equal(perf.source,'process_local_query_profiler');
    });
    await t.test('inventory JSON, summary and real PDF derive from the same database',async()=>{
      const data=(await expect(200,'GET','/reports/inventory/json?sortBy=price&sortOrder=desc',admin)).data;
      assert.equal(data.totalVehicles,3); assert.equal(data.vehicles[0].id,carId); assert.equal(data.summary.totalValue,300012600.25);
      const summary=(await expect(200,'GET','/reports/inventory/summary',admin)).data; assert.equal(summary.total,3);
      const pdf=await request('GET','/reports/inventory',admin); assert.equal(pdf.status,200); assert.match(pdf.headers.get('content-type'),/application\/pdf/);
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    });
    await t.test('spotlight writes are idempotent, durable and based on authoritative rows',async()=>{
      await expect(401,'POST','/spotlight/webhooks/vehicle-created',null,{id:carId});
      await expect(403,'POST','/spotlight/webhooks/vehicle-created',user,{id:carId});
      const results=await Promise.all([expect(200,'POST',`/spotlight/process/${carId}`,admin),expect(200,'POST',`/spotlight/process/${carId}`,admin)]);
      assert.ok(results.every(r=>r.data.qualifiesForSpotlight));
      const forged=await expect(200,'POST','/spotlight/webhooks/vehicle-created',admin,{id:otherId,price:999999999,model:'G-Wagon'});
      assert.equal(forged.data.qualifiesForSpotlight,false);
      const alarms=(await expect(200,'GET','/spotlight/alerts?unread=true',admin)).data; assert.equal(alarms.length,1);
      await expect(200,'PUT',`/spotlight/alerts/${alarms[0].id}/read`,admin);
      const freshSystem=createHighValueAlertSystem(db); assert.equal((await freshSystem.getAlerts())[0].isRead,true);
      await expect(200,'POST',`/spotlight/process/${carId}`,admin);
      assert.equal((await expect(200,'GET','/spotlight/alerts?unread=true',admin)).total,0);
      assert.equal((await expect(200,'GET','/spotlight/featured',admin)).data[0].id,carId);
      assert.equal((await expect(200,'GET','/spotlight/stats',admin)).data.featuredCount,1);
      await expect(200,'PATCH',`/cars/${carId}`,admin,{status:'Sold'});
      assert.equal((await expect(200,'GET','/spotlight/featured',admin)).total,0);
      await expect(200,'POST',`/spotlight/process/${carId}`,admin);
      assert.equal((await freshSystem.getAlerts()).length,0);
      const all=await expect(200,'POST','/spotlight/process-all',admin); assert.equal(all.data.processed,3);
      await expect(404,'POST','/spotlight/process/2147483647',admin);
    });
  } finally {
    if(server) await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    await db.close(); await bootstrap.end();
  }
});
