// backend/tests/testDriveEmail.integration.test.js
//
// Sprint 6 - Task 1: automated test drive email pipeline (Jest + Supertest)
//
// Verifies the full lifecycle through the real HTTP route:
// - booking a test drive triggers the immediate confirmation email,
// - the background checker sends exactly one reminder 24 hours before the
//   appointment and never sends a duplicate,
// - the pipeline degrades safely (no email, invalid data, dry runs).
//
// nodemailer is replaced by a transport double so the suite never sends real
// email, and the PostgreSQL pool is replaced so no database is required.

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import request from "supertest";

process.env.EMAIL_PROVIDER = "nodemailer";
process.env.EMAIL_HOST = "smtp.integration.test";
process.env.EMAIL_PORT = "587";
process.env.EMAIL_SECURE = "false";
process.env.EMAIL_USER = "integration-user";
process.env.EMAIL_PASSWORD = "integration-password";
process.env.EMAIL_FROM = "no-reply@pandamotors.test";
process.env.EMAIL_REPLY_TO = "support@pandamotors.test";

const sendMailMock = jest.fn(async () => ({
  messageId: "integration-test-message-id",
  accepted: ["integration@test"],
}));

jest.unstable_mockModule("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailMock }),
    getTestMessageUrl: () => null,
  },
}));

jest.unstable_mockModule("../config/db.js", () => ({
  default: { query: async () => ({ rows: [] }), on: () => {} },
  verifyDatabaseConnection: async () => ({ connected: true }),
  initializeDatabase: async () => {},
}));

const HOUR_IN_MS = 60 * 60 * 1000;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function buildBookingPayload({ hoursAhead, overrides = {} }) {
  const appointment = new Date(Date.now() + hoursAhead * HOUR_IN_MS);

  return {
    user_id: 1,
    car_id: 2,
    car_model: "Toyota Land Cruiser",
    date: toDateString(appointment),
    time_slot: "10:00",
    user_name: "Sprint Six Customer",
    user_email: "sprint6.customer@pandamotors.test",
    user_phone: "+256770826951",
    ...overrides,
  };
}

let app;
let httpServer;
let bookingsCollection;
let runTestDriveReminderCheck;
let isWithinReminderWindow;
let getHoursUntilAppointment;
let parseAppointmentDateTime;

beforeAll(async () => {
  const serverModule = await import("../server.js");
  const databaseModule = await import("../config/database.js");
  const reminderJobModule = await import("../jobs/testDriveReminderJob.js");

  app = serverModule.default;
  httpServer = serverModule.httpServer;
  bookingsCollection = databaseModule.default.collection("bookings");
  runTestDriveReminderCheck = reminderJobModule.runTestDriveReminderCheck;
  isWithinReminderWindow = reminderJobModule.isWithinReminderWindow;
  getHoursUntilAppointment = reminderJobModule.getHoursUntilAppointment;
  parseAppointmentDateTime = reminderJobModule.parseAppointmentDateTime;
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

beforeEach(() => {
  sendMailMock.mockClear();
});

describe("POST /api/bookings/create - immediate confirmation email", () => {
  test("persists the booking and sends one confirmation email", async () => {
    const payload = buildBookingPayload({ hoursAhead: 5 * 24 });

    const response = await request(app)
      .post("/api/bookings/create")
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.booking.user_email).toBe(payload.user_email);
    expect(response.body.notification).toMatchObject({
      attempted: true,
      sent: true,
      skipped: false,
      provider: "nodemailer",
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailOptions = sendMailMock.mock.calls[0][0];

    expect(mailOptions.to).toBe(payload.user_email);
    expect(mailOptions.from).toBe("no-reply@pandamotors.test");
    expect(mailOptions.subject).toContain("Test drive appointment confirmed");
    expect(mailOptions.html).toContain(payload.car_model);
    expect(mailOptions.html).toContain(payload.date);
    expect(mailOptions.html).toContain(payload.time_slot);
  });

  test("skips the confirmation email safely when no customer email is provided", async () => {
    const payload = buildBookingPayload({
      hoursAhead: 6 * 24,
      overrides: { car_id: 3, user_email: "" },
    });

    const response = await request(app)
      .post("/api/bookings/create")
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.notification).toMatchObject({
      attempted: false,
      sent: false,
      skipped: true,
    });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  test("still rejects an invalid time slot", async () => {
    const payload = buildBookingPayload({
      hoursAhead: 7 * 24,
      overrides: { car_id: 5, time_slot: "08:15" },
    });

    const response = await request(app)
      .post("/api/bookings/create")
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  test("still rejects a booking without the required fields", async () => {
    const response = await request(app)
      .post("/api/bookings/create")
      .send({ car_id: 1, date: "2026-12-01", time_slot: "10:00" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing required fields");
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("24 hour reminder background checker", () => {
  test("sends exactly one reminder for an appointment 24 hours away", async () => {
    const appointment = new Date(Date.now() + 24 * HOUR_IN_MS);
    const now = new Date(appointment.getTime() - 24 * HOUR_IN_MS);

    const booking = {
      userId: 5,
      carId: 4,
      carModel: "BMW X5",
      status: "confirmed",
      date: toDateString(appointment),
      timeSlot: `${String(appointment.getHours()).padStart(2, "0")}:${String(
        appointment.getMinutes()
      ).padStart(2, "0")}`,
      user_name: "Reminder Customer",
      user_email: "reminder.customer@pandamotors.test",
    };

    await bookingsCollection.insertOne(booking);

    const firstRun = await runTestDriveReminderCheck({ now });

    expect(firstRun.sent).toBe(1);
    expect(firstRun.failed).toBe(0);
    expect(firstRun.checkedAt).toBe(now.toISOString());
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailOptions = sendMailMock.mock.calls[0][0];

    expect(mailOptions.to).toBe(booking.user_email);
    expect(mailOptions.subject).toContain("Reminder");
    expect(mailOptions.html).toContain(booking.carModel);

    sendMailMock.mockClear();

    const secondRun = await runTestDriveReminderCheck({ now });

    expect(secondRun.sent).toBe(0);
    expect(secondRun.alreadyReminded).toBeGreaterThanOrEqual(1);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  test("does not email bookings outside the 24 hour window", async () => {
    const farAwayAppointment = new Date(Date.now() + 5 * 24 * HOUR_IN_MS);

    await bookingsCollection.insertOne({
      userId: 6,
      carId: 7,
      carModel: "Lexus LX570",
      status: "confirmed",
      date: toDateString(farAwayAppointment),
      timeSlot: "11:00",
      user_name: "Early Customer",
      user_email: "early.customer@pandamotors.test",
    });

    const report = await runTestDriveReminderCheck({ now: new Date() });

    expect(report.sent).toBe(0);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  test("dry run reports eligible bookings without sending email", async () => {
    const appointment = new Date(Date.now() + 24 * HOUR_IN_MS);
    const now = new Date(appointment.getTime() - 24 * HOUR_IN_MS);

    await bookingsCollection.insertOne({
      userId: 8,
      carId: 9,
      carModel: "Mercedes G-Wagon",
      status: "confirmed",
      date: toDateString(appointment),
      timeSlot: `${String(appointment.getHours()).padStart(2, "0")}:${String(
        appointment.getMinutes()
      ).padStart(2, "0")}`,
      user_name: "Dry Run Customer",
      user_email: "dryrun.customer@pandamotors.test",
    });

    const report = await runTestDriveReminderCheck({ now, dryRun: true });

    expect(report.sent).toBe(0);
    expect(report.eligible).toBeGreaterThanOrEqual(1);
    expect(report.results.some((result) => result.skipped === true)).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("Reminder scheduling helpers", () => {
  test("parses appointment date and time into a single timestamp", () => {
    const parsed = parseAppointmentDateTime({
      date: "2026-10-01",
      timeSlot: "14:30",
    });

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(9);
    expect(parsed.getDate()).toBe(1);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  test("returns null for an unusable appointment", () => {
    expect(parseAppointmentDateTime({ date: "not-a-date", time: "10:00" })).toBeNull();
    expect(parseAppointmentDateTime({ time: "10:00" })).toBeNull();
    expect(getHoursUntilAppointment({ date: "not-a-date", time: "10:00" })).toBeNull();
  });

  test("only the 23 to 25 hour band is inside the reminder window", () => {
    expect(isWithinReminderWindow(24)).toBe(true);
    expect(isWithinReminderWindow(23.5)).toBe(true);
    expect(isWithinReminderWindow(25)).toBe(true);
    expect(isWithinReminderWindow(22.9)).toBe(false);
    expect(isWithinReminderWindow(25.1)).toBe(false);
    expect(isWithinReminderWindow(null)).toBe(false);
  });

  test("computes the hours remaining until the appointment", () => {
    const now = new Date("2026-10-01T10:00:00");
    const hoursUntilAppointment = getHoursUntilAppointment(
      { date: "2026-10-02", timeSlot: "10:00" },
      now
    );

    expect(hoursUntilAppointment).toBeCloseTo(24, 5);
  });
});
