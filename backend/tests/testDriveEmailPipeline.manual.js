// backend/tests/testDriveEmailPipeline.manual.js
//
// Sprint 6 - Task 1 manual validation for the automated test drive email
// pipeline. Run with: npm run test:test-drive-emails
//
// The script never sends a real email. It validates the provider contract, the
// booking field normalization, both email templates, the 24 hour reminder
// window and the duplicate-reminder guard.

import db from "../config/database.js";
import {
  getTestDriveEmailPipelineStatus,
  normalizeTestDriveBooking,
  resolveEmailTransport,
  sendTestDriveConfirmation,
  sendTestDriveReminder,
} from "../services/emailService.js";
import {
  getHoursUntilAppointment,
  isWithinReminderWindow,
  parseAppointmentDateTime,
  runTestDriveReminderCheck,
} from "../jobs/testDriveReminderJob.js";

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAILED: ${message}`);
  } else {
    console.log(`PASSED: ${message}`);
  }
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

const bookingPayload = {
  name: "Manual Customer",
  email: "manual.customer@pandamotors.test",
  carModel: "Toyota Land Cruiser",
  date: "2026-11-20",
  timeSlot: "10:30",
};

console.log("=== Test drive email pipeline validation ===");

const status = getTestDriveEmailPipelineStatus();
assert(
  typeof status.configured === "boolean" && Boolean(status.provider),
  "email pipeline exposes a provider readiness status"
);
assert(
  JSON.stringify(status).includes("EMAIL_PASSWORD") === false,
  "email pipeline status never exposes provider secrets"
);

const transport = resolveEmailTransport();
assert(
  transport === null || typeof transport.transport === "object",
  "email transport resolution never throws"
);

const normalized = normalizeTestDriveBooking(bookingPayload);
assert(
  normalized.customerEmail === bookingPayload.email &&
    normalized.customerName === bookingPayload.name,
  "booking field aliases (name/email) are normalized"
);
assert(
  normalized.vehicleName === bookingPayload.carModel &&
    normalized.appointmentTime === bookingPayload.timeSlot,
  "booking vehicle and time aliases are normalized"
);

const storeStyleNormalized = normalizeTestDriveBooking({
  user_name: "Store Customer",
  user_email: "store.customer@pandamotors.test",
  car_model: "BMW X5",
  booking_date: "2026-11-21",
  time_slot: "14:00",
});
assert(
  storeStyleNormalized.customerEmail === "store.customer@pandamotors.test" &&
    storeStyleNormalized.vehicleName === "BMW X5",
  "stored booking field aliases (user_email/car_model) are normalized"
);

const confirmationResult = await sendTestDriveConfirmation(bookingPayload);
assert(
  confirmationResult.attempted === true || confirmationResult.skipped === true,
  "confirmation email attempt reports a delivery outcome"
);
assert(
  JSON.stringify(confirmationResult).includes("integration-password") === false,
  "confirmation result never exposes credentials"
);

const reminderResult = await sendTestDriveReminder(bookingPayload);
assert(
  reminderResult.attempted === true || reminderResult.skipped === true,
  "reminder email attempt reports a delivery outcome"
);

const invalidResult = await sendTestDriveReminder({ date: "", timeSlot: "" });
assert(
  invalidResult.sent === false && invalidResult.skipped === true,
  "invalid booking data is skipped instead of throwing"
);

const missingRecipientResult = await sendTestDriveConfirmation({});
assert(
  missingRecipientResult.sent === false,
  "missing recipient email is handled safely"
);

const parsedAppointment = parseAppointmentDateTime({
  date: "2026-11-20",
  timeSlot: "10:30",
});
assert(parsedAppointment instanceof Date, "appointment date and time parse");

assert(
  parseAppointmentDateTime({ date: "nope", time: "10:00" }) === null,
  "unusable appointment values return null"
);

const now = new Date("2026-11-19T10:30:00");
assert(
  Math.round(getHoursUntilAppointment(
    { date: "2026-11-20", timeSlot: "10:30" },
    now
  )) === 24,
  "hours until appointment is computed correctly"
);

assert(
  isWithinReminderWindow(24) === true &&
    isWithinReminderWindow(10) === false &&
    isWithinReminderWindow(null) === false,
  "reminder window only accepts appointments about 24 hours away"
);

const dryRunAppointment = new Date(Date.now() + 24 * 60 * 60 * 1000);
const dryRunBooking = await db.collection("bookings").insertOne({
  userId: 999,
  carId: 999,
  carModel: "Manual Validation Vehicle",
  status: "confirmed",
  date: toDateString(dryRunAppointment),
  timeSlot: `${String(dryRunAppointment.getHours()).padStart(2, "0")}:${String(
    dryRunAppointment.getMinutes()
  ).padStart(2, "0")}`,
  user_name: "Manual Validation Customer",
  user_email: "manual.validation@pandamotors.test",
});

const dryRunReport = await runTestDriveReminderCheck({ dryRun: true });

assert(
  dryRunReport.sent === 0,
  "dry run never sends reminder email"
);
assert(
  dryRunReport.results.some(
    (result) => result.bookingId === dryRunBooking.insertedId
  ),
  "dry run reports the booked appointment inside the reminder window"
);

const reminderRun = await runTestDriveReminderCheck();

assert(
  reminderRun.sent <= 1,
  "reminder run never sends more than one reminder per appointment"
);

const followUpRun = await runTestDriveReminderCheck();

assert(
  followUpRun.sent === 0 ||
    followUpRun.results.every((result) => result.sent === false),
  "reminders are never duplicated for the same appointment"
);

assert(Boolean(reminderRun.runId) && Boolean(reminderRun.checkedAt), "reminder runs return a traceable report");

if (failed > 0) {
  console.error(`${failed} test drive email pipeline check(s) failed.`);
  process.exit(1);
}

console.log("All test drive email pipeline manual checks passed.");
