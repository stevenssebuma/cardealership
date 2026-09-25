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

jest.unstable_mockModule("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async () => ({ messageId: "booking-integration-test", accepted: [] }),
    }),
    getTestMessageUrl: () => null,
  },
}));

jest.unstable_mockModule("../config/db.js", () => ({
  default: { query: async () => ({ rows: [] }), on: () => {} },
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

function buildPayload(overrides = {}) {
  return {
    user_id: customerA.id,
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
    const response = await request(app).post("/api/bookings/create").send(buildPayload());

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
      .send(buildPayload({ user_id: customerB.id, user_email: customerB.email }));

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.conflict).toBe(true);
    expect(response.body.error).toBe("Time slot already booked for this car");
  });

  test("rejects a time slot outside the dealership schedule", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
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
      .send(
        buildPayload({
          user_id: customerB.id,
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
