import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import db from '../../config/db.js';
import { updateBookingStatus, bulkUpdateBookings, approveCar, rejectCar, updateCar } from '../../controllers/adminController.js';

const reply = () => ({ statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

// Requires a disposable PostgreSQL test database selected through TEST_DATABASE_URL.
// Never run against staging, production or a database with customer records.
test('administrator transitions are atomic on PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL ? 'Requires isolated TEST_DATABASE_URL' : false },
  async t => {
    const marker = randomUUID().replaceAll('-', '').slice(0,16);
    let userId, carIds = [], bookingIds = [];
    t.after(async () => {
      if (bookingIds.length) await db.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [bookingIds]);
      if (carIds.length) await db.query('DELETE FROM cars WHERE id = ANY($1::int[])', [carIds]);
      if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId]);
    });
    const user = await db.query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4) RETURNING id',
      ['S17 Admin Review Test', 's17-review-'+marker+'@example.invalid','not-a-login-hash','user']);
    userId = user.rows[0].id;
    for (const status of ['pending','sold','pending']) {
      const created=await db.query('INSERT INTO cars (name,status,price,year) VALUES ($1,$2,$3,$4) RETURNING id',
        ['S17 Review Fixture',status,15000,2024]);
      carIds.push(created.rows[0].id);
    }
    for (const [i,status] of ['pending','completed','confirmed'].entries()) {
      const created=await db.query('INSERT INTO bookings (user_id,car_id,booking_date,time_slot,status) VALUES ($1,$2,CURRENT_DATE + 35,$3,$4) RETURNING id',
        [userId,carIds[0],`${String(i+8).padStart(2,'0')}:00-${String(i+9).padStart(2,'0')}:00`,status]);
      bookingIds.push(created.rows[0].id);
    }
    let res=reply();
    await bulkUpdateBookings({ body: { ids: [bookingIds[0],bookingIds[1]], status:'confirmed' } },res);
    assert.equal(res.statusCode,409);
    assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[bookingIds[0]])).rows[0].status,'pending');
    res=reply();
    await bulkUpdateBookings({ body: { ids: [bookingIds[0],bookingIds[2]], status:'confirmed' } },res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body.updatedIds.sort((a,b)=>a-b),[bookingIds[0],bookingIds[2]].sort((a,b)=>a-b));
    res=reply();
    await updateBookingStatus({params:{id:bookingIds[1]},body:{status:'pending'}},res);
    assert.equal(res.statusCode,409);
    res=reply();
    await approveCar({params:{id:carIds[1]}},res);
    assert.equal(res.statusCode,409);
    res=reply();
    await approveCar({params:{id:carIds[0]}},res);
    assert.equal(res.statusCode,200);
    res=reply();
    await rejectCar({params:{id:carIds[2]}},res);
    assert.equal(res.statusCode,200);
    res=reply();
    await updateCar({params:{id:carIds[0]},body:{price:-30}},res);
    assert.equal(res.statusCode,400);
    res=reply();
    await updateCar({params:{id:carIds[1]},body:{status:'available'}},res);
    assert.equal(res.statusCode,409);
  });
