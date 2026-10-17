import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, beforeEach, test } from "node:test";
import app from "../../app.js";
import db from "../../config/db.js";

let server;
let baseUrl;
let customer;
let admin;
let carId;
let bookingId;
const runId = `api-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const carVin = `PTEST${Date.now().toString().slice(-12)}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json();
  return { response, body };
}

async function cleanFixtures() {
  await db.query(
    `DELETE FROM test_drives WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1) OR car_id IN (SELECT id FROM cars WHERE vin = $2)`,
    [`${runId}%`, carVin],
  );
  await db.query(
    `DELETE FROM car_specs WHERE car_id IN (SELECT id FROM cars WHERE vin = $1)`,
    [carVin],
  );
  await db.query(
    `DELETE FROM car_images WHERE car_id IN (SELECT id FROM cars WHERE vin = $1)`,
    [carVin],
  );
  await db.query(`DELETE FROM cars WHERE vin = $1`, [carVin]);
  await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${runId}%`]);
}

async function createFixtureUser(role) {
  const email = `${runId}-${role}@example.test`;
  const password = "Secure-pass-123";
  const hash = await bcrypt.hash(password, 10);
  const result = await db.query(
    `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
    [`API ${role}`, email, hash, role],
  );
  const user = result.rows[0];
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 200);
  return { ...user, token: login.body.data.token };
}

function authorization(user) {
  return { authorization: `Bearer ${user.token}` };
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await cleanFixtures();
  customer = await createFixtureUser("customer");
  admin = await createFixtureUser("admin");
});

after(async () => {
  await cleanFixtures();
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

// Auth: registration cannot elevate its own role; login/session/token errors are HTTP-level contracts.
test("authentication contracts", async () => {
  const email = `${runId}-registered@example.test`;
  const registration = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Registered customer",
      email,
      password: "Secure-pass-123",
      role: "admin",
    }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.data.user.role, "customer");
  const duplicate = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Duplicate",
      email,
      password: "Secure-pass-123",
    }),
  });
  assert.equal(duplicate.response.status, 409);
  const invalidLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(invalidLogin.response.status, 401);
  const missingToken = await request("/api/auth/me");
  assert.equal(missingToken.response.status, 401);
  const invalidToken = await request("/api/auth/me", {
    headers: { authorization: "Bearer not-a-token" },
  });
  assert.equal(invalidToken.response.status, 403);
  const session = await request("/api/auth/session", {
    headers: authorization(customer),
  });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.data.id, customer.id);
});

test("cars support listing, filters, validation, and admin-only mutations", async () => {
  const denied = await request("/api/cars", {
    method: "POST",
    headers: authorization(customer),
    body: JSON.stringify({}),
  });
  assert.equal(denied.response.status, 403);
  const invalid = await request("/api/cars", {
    method: "POST",
    headers: authorization(admin),
    body: JSON.stringify({
      name: "No price",
      brand: "Panda",
      year: 2026,
      price: 0,
    }),
  });
  assert.equal(invalid.response.status, 400);
  const created = await request("/api/cars", {
    method: "POST",
    headers: authorization(admin),
    body: JSON.stringify({
      name: "API Test Coupe",
      brand: "Panda",
      model: "Coupe",
      type: "SUV",
      category: "Test",
      year: 2026,
      price: 55000000,
      vin: carVin,
    }),
  });
  assert.equal(created.response.status, 201);
  carId = created.body.car.id;
  const listed = await request(`/api/cars?make=Panda&year=2026`);
  assert.equal(listed.response.status, 200);
  assert.ok(listed.body.cars.some((car) => car.id === carId));
  const detail = await request(`/api/cars/${carId}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.car.brand, "Panda");
  const updated = await request(`/api/cars/${carId}`, {
    method: "PUT",
    headers: authorization(admin),
    body: JSON.stringify({ price: 56000000, color: "Blue" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(Number(updated.body.car.price), 56000000);
});

test("bookings are persistent, exclusive, and visible only to their owner or an administrator", async () => {
  const availability = await request(
    `/api/bookings/check-availability?car_id=${carId}&date=2030-01-15`,
  );
  assert.equal(availability.response.status, 200);
  assert.ok(availability.body.availableSlots.includes("10:00"));
  const created = await request("/api/bookings", {
    method: "POST",
    headers: authorization(customer),
    body: JSON.stringify({
      car_id: carId,
      date: "2030-01-15",
      time_slot: "10:00",
    }),
  });
  assert.equal(created.response.status, 201);
  bookingId = created.body.booking.id;
  const duplicate = await request("/api/bookings", {
    method: "POST",
    headers: authorization(admin),
    body: JSON.stringify({
      car_id: carId,
      date: "2030-01-15",
      time_slot: "10:00",
    }),
  });
  assert.equal(duplicate.response.status, 409);
  const own = await request("/api/bookings/me", {
    headers: authorization(customer),
  });
  assert.equal(own.response.status, 200);
  assert.ok(own.body.bookings.some((booking) => booking.id === bookingId));
  const other = await request(`/api/bookings/user/${customer.id}`, {
    headers: authorization(admin),
  });
  assert.equal(other.response.status, 200);
  const customerCannotSeeAdmin = await request(
    `/api/bookings/user/${admin.id}`,
    { headers: authorization(customer) },
  );
  assert.equal(customerCannotSeeAdmin.response.status, 403);
});

test("admin controls enforce roles and legal booking transitions", async () => {
  const denied = await request("/api/admin/stats", {
    headers: authorization(customer),
  });
  assert.equal(denied.response.status, 403);
  const stats = await request("/api/admin/stats", {
    headers: authorization(admin),
  });
  assert.equal(stats.response.status, 200);
  assert.equal(stats.body.stats.salesMetricsAvailable, false);
  const users = await request("/api/admin/users", {
    headers: authorization(admin),
  });
  assert.equal(users.response.status, 200);
  assert.ok(users.body.data.some((user) => user.id === customer.id));
  assert.ok(users.body.data.every((user) => !("password" in user)));
  const allBookings = await request("/api/admin/bookings", {
    headers: authorization(admin),
  });
  assert.equal(allBookings.response.status, 200);
  const initial = allBookings.body.data.find(
    (booking) => booking.id === bookingId,
  );
  assert.equal(initial.status, "pending");
  const confirmed = await request(`/api/admin/bookings/${bookingId}/status`, {
    method: "PUT",
    headers: authorization(admin),
    body: JSON.stringify({
      status: "confirmed",
      expectedUpdatedAt: initial.updatedAt,
    }),
  });
  assert.equal(confirmed.response.status, 200);
  const illegal = await request(`/api/admin/bookings/${bookingId}/status`, {
    method: "PUT",
    headers: authorization(admin),
    body: JSON.stringify({ status: "pending" }),
  });
  assert.equal(illegal.response.status, 422);
  const cancelled = await request(`/api/bookings/${bookingId}/cancel`, {
    method: "PUT",
    headers: authorization(customer),
  });
  assert.equal(cancelled.response.status, 200);
});

test("admin can delete only its test car after booking records are cleaned", async () => {
  await db.query(`DELETE FROM test_drives WHERE car_id = $1`, [carId]);
  const deleted = await request(`/api/cars/${carId}`, {
    method: "DELETE",
    headers: authorization(admin),
  });
  assert.equal(deleted.response.status, 200);
  const detail = await request(`/api/cars/${carId}`);
  assert.equal(detail.response.status, 404);
});
