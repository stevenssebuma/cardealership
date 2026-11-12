// backend/tests/adminCustomers.integration.test.js
//
// Covers the admin customer directory and the per-customer booking history:
// - GET /api/admin/users is admin-only and carries a booking count,
// - GET /api/admin/users/:user_id/bookings is admin-only, 404s for unknown
//   customers and 400s for a malformed id,
// - the history keeps cancelled bookings, which the customer-facing route hides.
//
// The PostgreSQL pool is replaced by a stateful double; the real Express app,
// middleware chain and JWT signing are exercised through HTTP.

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import fs from "node:fs";

import request from "supertest";

import { createAdminCustomersTestPool } from "./helpers/adminCustomersTestPool.js";

const poolMock = createAdminCustomersTestPool();

jest.unstable_mockModule("../config/db.js", () => ({
  default: { query: poolMock.query, on: () => {} },
  withTransaction: async (callback) =>
    callback({ query: poolMock.query, release: () => {} }),
  verifyDatabaseConnection: async () => ({ connected: true }),
  initializeDatabase: async () => {},
}));

const adminIdentity = { id: 1, email: "admin@pandamotors.test", role: "admin" };
const customerIdentity = {
  id: 7,
  email: "amina@pandamotors.test",
  role: "user",
};

const routeSource = fs.readFileSync(
  new URL("../routes/adminRoutes.js", import.meta.url),
  "utf8",
);

let app;
let httpServer;
let generateToken;

function authorization(identity) {
  return `Bearer ${generateToken(identity)}`;
}

beforeAll(async () => {
  const serverModule = await import("../server.js");
  const authMiddlewareModule = await import("../middleware/authMiddleware.js");

  app = serverModule.default;
  httpServer = serverModule.httpServer;
  generateToken = authMiddlewareModule.generateToken;

  poolMock.seedUser({
    id: 7,
    name: "Amina Nakato",
    email: "amina@pandamotors.test",
    role: "user",
    created_at: "2026-10-01T09:00:00.000Z",
  });
  poolMock.seedUser({
    id: 8,
    name: "Daniel Kato",
    email: "daniel@pandamotors.test",
    role: "user",
    created_at: "2026-10-05T09:00:00.000Z",
  });

  poolMock.seedBooking({
    user_id: 7,
    car_model: "Toyota Land Cruiser",
    date: "2026-12-01",
    time_slot: "10:00",
    status: "confirmed",
  });
  poolMock.seedBooking({
    user_id: 7,
    car_model: "BMW X5",
    date: "2026-11-01",
    time_slot: "09:00",
    status: "cancelled",
  });
  poolMock.seedBooking({
    user_id: 8,
    car_model: "Mercedes GLE",
    date: "2026-10-20",
    time_slot: "14:00",
    status: "completed",
  });
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

describe("admin customer directory", () => {
  test("requires a bearer token", async () => {
    const response = await request(app).get("/api/admin/users");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("refuses a customer token", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .set("Authorization", authorization(customerIdentity));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ADMIN_ACCESS_REQUIRED");
  });

  test("returns customers with a booking count and no password field", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .set("Authorization", authorization(adminIdentity));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.total).toBe(2);
    expect(JSON.stringify(response.body)).not.toContain("password");

    const amina = response.body.data.find((user) => user.id === 7);
    const daniel = response.body.data.find((user) => user.id === 8);

    expect(amina.booking_count).toBe(2);
    expect(daniel.booking_count).toBe(1);
  });
});

describe("admin per-customer booking history", () => {
  test("requires a bearer token", async () => {
    const response = await request(app).get("/api/admin/users/7/bookings");

    expect(response.status).toBe(401);
  });

  test("refuses a customer token", async () => {
    const response = await request(app)
      .get("/api/admin/users/7/bookings")
      .set("Authorization", authorization(customerIdentity));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ADMIN_ACCESS_REQUIRED");
  });

  test("returns the customer and every booking, cancelled included", async () => {
    const response = await request(app)
      .get("/api/admin/users/7/bookings")
      .set("Authorization", authorization(adminIdentity));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toMatchObject({
      id: 7,
      name: "Amina Nakato",
      email: "amina@pandamotors.test",
    });
    expect(response.body.total).toBe(2);

    const statuses = response.body.bookings.map((booking) => booking.status);
    expect(statuses).toContain("cancelled");

    // Newest appointment first.
    expect(response.body.bookings[0].date).toBe("2026-12-01");
    expect(response.body.bookings[0].carModel).toBe("Toyota Land Cruiser");
  });

  test("never mixes in another customer's bookings", async () => {
    const response = await request(app)
      .get("/api/admin/users/8/bookings")
      .set("Authorization", authorization(adminIdentity));

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.bookings[0].carModel).toBe("Mercedes GLE");
    expect(
      response.body.bookings.every((booking) => booking.userId === 8),
    ).toBe(true);
  });

  test("404s for an unknown customer", async () => {
    const response = await request(app)
      .get("/api/admin/users/9999/bookings")
      .set("Authorization", authorization(adminIdentity));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Customer not found");
  });

  test("400s for a malformed customer id", async () => {
    const response = await request(app)
      .get("/api/admin/users/not-a-number/bookings")
      .set("Authorization", authorization(adminIdentity));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid user ID");
  });

  test("mounts the route behind the full admin guard", () => {
    expect(routeSource).toMatch(
      /router\.get\(\s*'\/users\/:user_id\/bookings',\s*\.\.\.adminGuard,\s*getUserBookingsForAdmin\s*\)/,
    );
    expect(routeSource).toContain(
      "const adminGuard = [rateLimitProtectedRoute, authenticateToken, checkRole(['admin'])]",
    );
  });
});
