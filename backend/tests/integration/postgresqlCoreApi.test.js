import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { buildPoolConfig } from '../../config/databasePoolConfig.js';
import { createExchangeRateRepository } from '../../repositories/exchangeRateRepository.js';
import { createCarLookupRepository, createCarImageRepository } from '../../repositories/bulkCarImageRepository.js';

const url = process.env.S17_NATIVE_TEST_DATABASE_URL;
const password = 'synthetic-p4a-password';
const vehicle = {
  vin: '1HGCM82633A004352', make: 'Honda', model: 'Accord', name: 'P4A Accord',
  type: 'Sedan', category: 'Sedan', year: 2020, price: 12500.50, mileage: 5000,
  color: 'Blue', condition: 'Used', status: 'Available', power: '150 hp',
  engine: '2.0 L', drive: 'FWD', images: ['https://example.invalid/car.jpg'],
};

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('actual core API on native PostgreSQL', {
  skip: !url ? 'Set S17_NATIVE_TEST_DATABASE_URL to a fresh disposable local database.' : false,
  timeout: 45000,
}, async (t) => {
  const config = buildPoolConfig({ NODE_ENV: 'test', TEST_DATABASE_URL: url });
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.host));
  assert.match(config.database, /^cardealership_s17_test(?:_[a-z0-9]+)?$/);
  const client = new pg.Client(config);
  await client.connect();
  let child;
  let logs = '';
  const port = await reservePort();
  const request = async (method, path, token, body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, signal: AbortSignal.timeout(5000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const expect = async (status, ...args) => {
    const result = await request(...args);
    assert.equal(result.status, status, `${args[0]} ${args[1]}: ${result.body.message ?? result.body.error?.message ?? ''}`);
    return result.body;
  };
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, config.database);
    assert.equal(Number((await client.query("SELECT count(*) AS n FROM pg_catalog.pg_tables WHERE schemaname='public'")).rows[0].n), 0, 'Refusing nonempty database');
    await client.query(await readFile(new URL('../../scripts/schema.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,$4)', ['P4A Admin', 'admin@example.invalid', await bcrypt.hash(password, 10), 'admin']);
    const environment = { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: url, JWT_SECRET: 'synthetic-p4a-only-secret', PORT: String(port), TZ: 'UTC', EXCHANGE_RATE_PROVIDER: 'mock', EXCHANGE_RATE_MOCK_SCENARIO: 'success' };
    delete environment.DATABASE_URL;
    child = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { logs = (logs + chunk).slice(-10000); });
    let healthy = false;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) break;
      try { healthy = (await request('GET', '/health')).status === 200; } catch { /* wait for server */ }
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(healthy, 'Server failed to start');

    await t.test('exchange rates persist in PostgreSQL and are returned from database cache', async () => {
      const firstRate = await expect(200, 'GET', '/exchange-rates?baseCurrency=UGX');
      assert.equal(firstRate.provider, 'mock');
      assert.equal(firstRate.rates.UGX, 1);
      assert.equal((await expect(200, 'GET', '/exchange-rates?baseCurrency=UGX')).source, 'database_cache');
      const stored = await client.query("SELECT rates, provider, observed_at FROM exchange_rate_snapshots WHERE base_currency='UGX' ORDER BY id DESC LIMIT 1");
      assert.equal(stored.rows[0].rates.USD, firstRate.rates.USD);
      assert.equal(stored.rows[0].provider, 'mock');
      assert.ok(stored.rows[0].observed_at instanceof Date);
      await expect(400, 'GET', '/exchange-rates?baseCurrency=UGX&baseCurrency=USD');
      await expect(405, 'POST', '/exchange-rates', null, {});
    });
    await t.test('exchange snapshot ordering, expiry and PostgreSQL timestamp semantics', async () => {
      const repository = createExchangeRateRepository(client);
      const fixture = { baseCurrency: 'USD', rates: { USD: 1, UGX: 3700 }, provider: 'frankfurter',
        retrievedAt: '2026-09-18T10:00:00Z', observedAt: '2026-09-17T00:00:00Z', expiresAt: '2026-09-18T12:00:00Z' };
      const first = await repository.saveFreshSnapshot(fixture);
      const second = await repository.saveFreshSnapshot(fixture);
      await repository.saveFreshSnapshot({ ...fixture, retrievedAt: '2026-09-18T13:00:00Z', expiresAt: '2026-09-18T15:00:00Z' });
      assert.ok(BigInt(second.id) > BigInt(first.id));
      assert.deepEqual(await repository.findLatestUsableSnapshot('usd', '2026-09-18T11:00:00Z'), second);
      assert.equal(await repository.findLatestUsableSnapshot('USD', '2026-09-18T12:00:00Z'), null);
      assert.equal(second.observedAt.toISOString(), '2026-09-17T00:00:00.000Z');
      assert.equal((await repository.findLatestSnapshot('USD')).retrievedAt.toISOString(), '2026-09-18T13:00:00.000Z');
    });

    let admin, user, other, carId, first, second;
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 2);
    if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    const day = date.toISOString().slice(0, 10);
    await t.test('register, duplicate rejection, login and persisted RBAC', async () => {
      const registration = { name: 'P4A User', email: 'User@example.invalid', password };
      user = (await expect(201, 'POST', '/auth/register', null, registration)).token;
      other = (await expect(201, 'POST', '/auth/register', null, { ...registration, name: 'P4A Other', email: 'other@example.invalid' })).token;
      await expect(409, 'POST', '/auth/register', null, { ...registration, email: 'USER@example.invalid' });
      admin = (await expect(200, 'POST', '/auth/login', null, { email: 'ADMIN@example.invalid', password })).token;
      assert.equal((await expect(200, 'GET', '/auth/me', user)).user.email, 'user@example.invalid');
      assert.equal((await expect(200, 'GET', '/auth/me', user)).user.role, 'user');
      await expect(401, 'GET', '/admin/stats');
      await expect(403, 'GET', '/admin/stats', user);
      assert.equal((await expect(200, 'GET', '/auth/users', admin)).count, 3);
      await client.query("UPDATE users SET role='user' WHERE email='admin@example.invalid'");
      await expect(403, 'GET', '/admin/stats', admin);
      await client.query("UPDATE users SET role='admin' WHERE email='admin@example.invalid'");
    });
    await t.test('vehicle write and read, numeric price, images and specs', async () => {
      await expect(403, 'POST', '/cars', user, vehicle);
      carId = (await expect(201, 'POST', '/cars', admin, vehicle)).car.id;
      await expect(409, 'POST', '/cars', admin, vehicle);
      const list = await expect(200, 'GET', '/cars');
      assert.equal(list.cars[0].price, vehicle.price);
      assert.equal(list.cars[0].images[0].url, vehicle.images[0]);
      const detail = (await expect(200, 'GET', `/cars/${carId}`)).car;
      assert.equal(detail.power, vehicle.power);
      assert.equal(detail.brand, vehicle.make);
      assert.equal(detail.images[0].image_url, vehicle.images[0]);
      const updated = (await expect(200, 'PATCH', `/cars/${carId}`, admin, { price: 12000.25, engine: '2.2 L' })).car;
      assert.equal(updated.price, 12000.25);
      assert.equal(updated.engine, '2.2 L');
      const lookup = createCarLookupRepository(client);
      assert.equal((await lookup.findById(String(carId))).id, carId);
      assert.equal(await lookup.findById('invalid'), null);
      const imageRepository = createCarImageRepository(client);
      const image = await imageRepository.create({ carId, url: 'https://example.invalid/rear.jpg', displayOrder: 1 });
      assert.equal(image.imageType, 'general');
      assert.equal((await expect(200, 'GET', `/cars/${carId}`)).car.images.length, 2);
    });
    await t.test('concurrent requests reserve exactly one active slot', async () => {
      const booking = { car_id: carId, booking_date: day, time_slot: '09:00-10:00' };
      const results = await Promise.all([user, other].map((token) => request('POST', '/bookings/create', token, booking)));
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
      const winner = results.findIndex((result) => result.status === 201);
      first = results[winner].body.booking;
      assert.equal(first.booking_date, day);
      assert.equal((await expect(200, 'GET', `/bookings/check-availability?car_id=${carId}&booking_date=${day}&time_slot=${booking.time_slot}`)).isAvailable, false);
      assert.equal((await expect(200, 'GET', `/bookings/available-slots/${carId}/${day}`)).bookedSlots[0], booking.time_slot);
      assert.equal((await expect(200, 'GET', `/bookings/weekly-availability/${carId}?startDate=${day}`)).week.length, 7);
      assert.equal((await expect(200, 'GET', '/bookings/me', [user, other][winner])).count, 1);
      await expect(404, 'DELETE', `/bookings/${first.id}/cancel`, [user, other][1 - winner]);
      await expect(200, 'DELETE', `/bookings/${first.id}/cancel`, [user, other][winner]);
      second = (await expect(201, 'POST', '/bookings/create', [user, other][1 - winner], booking)).booking;
    });
    await t.test('administration filters, analytics, status changes and inventory', async () => {
      const stats = (await expect(200, 'GET', '/admin/stats', admin)).stats;
      assert.equal(stats.cars.total, 1);
      assert.equal(stats.bookings.total, 2);
      assert.equal(stats.popularCars[0].booking_count, 2);
      assert.equal((await expect(200, 'GET', '/admin/pending-approvals', admin)).pendingBookings.length, 1);
      const matches = await expect(200, 'GET', `/admin/bookings?status=pending&from=${day}&to=${day}&car_id=${carId}&q=accord`, admin);
      assert.equal(matches.count, 1);
      assert.equal(matches.bookings[0].booking_date, day);
      await expect(409, 'PUT', `/admin/bookings/${first.id}/status`, admin, { status: 'confirmed' });
      await expect(200, 'PUT', `/admin/bookings/${second.id}/status`, admin, { status: 'confirmed' });
      // Upstream policy: a cancelled booking can never be reopened.
      await expect(409, 'PUT', '/admin/bookings/bulk', admin, { ids: [first.id, second.id], status: 'completed' });
      const bulk = await expect(200, 'PUT', '/admin/bookings/bulk', admin, { ids: [second.id], status: 'completed' });
      assert.deepEqual(bulk.updatedIds, [second.id]);
      // Only pending vehicles may be rejected or approved through review actions.
      await expect(409, 'PUT', `/admin/cars/${carId}/reject`, admin);
      await client.query('UPDATE cars SET status = $1 WHERE id = $2', ['pending', carId]);
      assert.equal((await expect(200, 'PUT', `/admin/cars/${carId}/reject`, admin)).car.status, 'rejected');
      await client.query('UPDATE cars SET status = $1 WHERE id = $2', ['pending', carId]);
      assert.equal((await expect(200, 'PUT', `/admin/cars/${carId}/approve`, admin)).car.is_available, true);
      const changed = (await expect(200, 'PUT', `/admin/cars/${carId}`, admin, { brand: 'Honda Updated' })).car;
      assert.equal(changed.make, 'Honda Updated');
      assert.equal(changed.brand, 'Honda Updated');
    });
    await t.test('foreign key rejection rolls the complete inventory deletion back', async () => {
      await client.query(`INSERT INTO financing_leads (
        reference_code,idempotency_key,car_id,customer_name,customer_phone, vehicle_price_snapshot,
        down_payment,loan_amount,annual_interest_rate,loan_term_months,monthly_payment,total_payment,total_interest,contact_consent
      ) VALUES ('P4A-FIXTURE','p4a-fixture',$1,'Synthetic','000',12000,2000,10000,0,10,1000,10000,0,true)`, [carId]);
      await expect(409, 'DELETE', `/cars/${carId}`, admin);
      const retained = (await expect(200, 'GET', `/cars/${carId}`)).car;
      assert.equal(retained.images.length, 2);
      assert.equal(retained.engine, '2.2 L');
      await client.query('DELETE FROM financing_leads WHERE reference_code=$1', ['P4A-FIXTURE']);
    });
    await t.test('delete vehicle and dependent rows atomically', async () => {
      await expect(200, 'DELETE', `/cars/${carId}`, admin);
      await expect(404, 'GET', `/cars/${carId}`);
      for (const table of ['car_specs', 'car_images', 'bookings']) {
        assert.equal(Number((await client.query(`SELECT count(*) AS n FROM ${table} WHERE car_id=$1`, [carId])).rows[0].n), 0);
      }
    });
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    if (!child || !logs.includes('Incoming request')) t.diagnostic(logs);
    await client.end();
  }
});
