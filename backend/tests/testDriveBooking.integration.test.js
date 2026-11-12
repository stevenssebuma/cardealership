// backend/tests/testDriveBooking.integration.test.js
//
// Integration coverage for the test-drive booking flow used by the frontend
// scheduler and the profile booking history panel:
// - POST /api/bookings/create persists the booking and confirms it,
// - booking the same car, date and time again is rejected with a conflict,
// - GET /api/bookings/check-availability stops offering the booked slot,
// - GET /api/bookings/me is authenticated and scoped to the caller.
//
// nodemailer and the PostgreSQL pool are replaced by doubles so the suite runs
// deterministically without a database or an SMTP provider.

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import request from "supertest";

import { createBookingTestPool } from "./helpers/bookingTestPool.js";

jest.unstable_mockModule("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async () => ({ messageId: "booking-integration-test", accepted: [] }),
    }),
    getTestMessageUrl: () => null,
  },
}));

// Stateful double for the bookings table so the routes exercise their real SQL.
const poolMock = createBookingTestPool();

jest.unstable_mockModule("../config/db.js", () => ({
  default: { query: poolMock.query, on: () => {} },
  withTransaction: async (callback) =>
    callback({ query: poolMock.query, release: () => {} }),
  verifyDatabaseConnection: async () => ({ connected: true }),
  initializeDatabase: async () => {},
}));

function toDateString(offsetDays) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

const customerA = { id: 501, email: "booking.a@pandamotors.test", role: "user" };
const customerB = { id: 502, email: "booking.b@pandamotors.test", role: "user" };

const bookedDate = toDateString(9);
const bookedSlot = "11:00";

// Identity travels in the bearer token; the payload only carries the vehicle,
// the slot and the contact details.
function buildPayload(overrides = {}) {
  return {
    car_id: 7,
    car_model: "Toyota Hilux",
    date: bookedDate,
    time_slot: bookedSlot,
    user_name: "Booking Customer A",
    user_email: customerA.email,
    user_phone: "+256700123456",
    ...overrides,
  };
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

let app;
let httpServer;
let generateToken;

beforeAll(async () => {
  const serverModule = await import("../server.js");
  const authMiddlewareModule = await import("../middleware/authMiddleware.js");

  app = serverModule.default;
  httpServer = serverModule.httpServer;
  generateToken = authMiddlewareModule.generateToken;
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

describe("POST /api/bookings/create", () => {
  test("persists the test drive and confirms it", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", authorization(customerA))
      .send(buildPayload());

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe(
      `Test drive booked for ${bookedDate} at ${bookedSlot}`,
    );
    expect(response.body.booking).toMatchObject({
      userId: customerA.id,
      carId: 7,
      carModel: "Toyota Hilux",
      date: bookedDate,
      timeSlot: bookedSlot,
      status: "confirmed",
    });
  });

  test("rejects a second booking for the same car, date and time", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", authorization(customerB))
      .send(buildPayload({ user_email: customerB.email }));

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.conflict).toBe(true);
    expect(response.body.error).toBe("Time slot already booked for this car");
  });

  test("rejects a time slot outside the dealership schedule", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", authorization(customerA))
      .send(buildPayload({ car_id: 8, time_slot: "23:45" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid time slot");
  });
});

describe("GET /api/bookings/check-availability", () => {
  test("no longer offers the slot that was just booked", async () => {
    const response = await request(app)
      .get("/api/bookings/check-availability")
      .query({ car_id: 7, date: bookedDate });

    expect(response.status).toBe(200);
    expect(response.body.allSlots).toContain(bookedSlot);
    expect(response.body.availableSlots).not.toContain(bookedSlot);
  });
});

describe("GET /api/bookings/me", () => {
  test("requires a bearer token", async () => {
    const response = await request(app).get("/api/bookings/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("returns only the authenticated customer's bookings", async () => {
    await request(app)
      .post("/api/bookings/create")
      .set("Authorization", authorization(customerB))
      .send(
        buildPayload({
          user_email: customerB.email,
          car_id: 9,
          date: toDateString(15),
          time_slot: "15:00",
        }),
      );

    const response = await request(app)
      .get("/api/bookings/me")
      .set("Authorization", `Bearer ${generateToken(customerA)}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.userId).toBe(customerA.id);
    expect(response.body.bookings.length).toBeGreaterThan(0);

    for (const booking of response.body.bookings) {
      expect(booking.userId).toBe(customerA.id);
    }
  });
});

describe("POST /api/bookings/create - booking attribution", () => {
  test("requires an authenticated session", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
      .send(
        buildPayload({
          car_id: 11,
          date: toDateString(21),
          time_slot: "12:00",
        }),
      );

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("ignores a user_id that does not match the token owner", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", authorization(customerB))
      .send(
        buildPayload({
          user_id: customerA.id,
          car_id: 12,
          date: toDateString(22),
          time_slot: "14:00",
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.booking.userId).toBe(customerB.id);

    const customerABookings = await request(app)
      .get("/api/bookings/me")
      .set("Authorization", authorization(customerA));
    const customerBBookings = await request(app)
      .get("/api/bookings/me")
      .set("Authorization", authorization(customerB));

    const bookedId = response.body.booking.id;

    expect(customerABookings.body.bookings.map((booking) => booking.id)).not.toContain(
      bookedId,
    );
    expect(customerBBookings.body.bookings.map((booking) => booking.id)).toContain(
      bookedId,
    );
  });
});

describe("booking ownership", () => {
  let customerABookingId;

  beforeAll(async () => {
    const created = await request(app)
      .post("/api/bookings/create")
      .set("Authorization", authorization(customerA))
      .send(
        buildPayload({
          car_id: 21,
          date: toDateString(30),
          time_slot: "09:00",
        }),
      );

    expect(created.status).toBe(201);
    customerABookingId = created.body.booking.id;
  });

  test("GET /api/bookings/user/:user_id requires a bearer token", async () => {
    const response = await request(app).get(`/api/bookings/user/${customerA.id}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("GET /api/bookings/user/:user_id refuses another customer's history", async () => {
    const response = await request(app)
      .get(`/api/bookings/user/${customerA.id}`)
      .set("Authorization", authorization(customerB));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.bookings).toBeUndefined();
  });

  test("GET /api/bookings/user/:user_id returns the caller's own history", async () => {
    const response = await request(app)
      .get(`/api/bookings/user/${customerA.id}`)
      .set("Authorization", authorization(customerA));

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThan(0);

    for (const booking of response.body.bookings) {
      expect(booking.userId).toBe(customerA.id);
    }
  });

  test("PUT /api/bookings/:id/cancel requires a bearer token", async () => {
    const response = await request(app).put(
      `/api/bookings/${customerABookingId}/cancel`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("PUT /api/bookings/:id/cancel refuses another customer's booking", async () => {
    const response = await request(app)
      .put(`/api/bookings/${customerABookingId}/cancel`)
      .set("Authorization", authorization(customerB));

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // The rejected call left the booking untouched for its owner.
    const ownerBookings = await request(app)
      .get("/api/bookings/me")
      .set("Authorization", authorization(customerA));
    const booking = ownerBookings.body.bookings.find(
      (item) => item.id === customerABookingId,
    );

    expect(booking).toBeDefined();
    expect(booking.status).toBe("confirmed");
  });

  test("PUT /api/bookings/:id/cancel cancels the owner's booking", async () => {
    const response = await request(app)
      .put(`/api/bookings/${customerABookingId}/cancel`)
      .set("Authorization", authorization(customerA));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.booking.status).toBe("cancelled");
  });
});
