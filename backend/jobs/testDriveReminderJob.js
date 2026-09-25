// backend/jobs/testDriveReminderJob.js
//
// Sprint 6 - Automated Test Drive Email Pipeline
//
// Background checker that emails customers approximately 24 hours before their
// confirmed test drive appointment.
//
// The checker runs on an in-process interval (no extra dependency) and is
// exported as a pure function so it can be validated by the automated test
// suite and by the manual script in tests/testDriveEmailPipeline.manual.js.

import { randomUUID } from "node:crypto";
import db from "../config/database.js";
import { sendTestDriveReminder } from "../services/emailService.js";

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_WINDOW_HOURS = 24;

// The reminder window is intentionally one hour wide on either side of the
// target so an hourly run can never step over an appointment.
const WINDOW_TOLERANCE_HOURS = 1;

const TIME_SLOT_PATTERN = /^\d{2}:\d{2}$/;

let reminderInterval = null;
let isCheckRunning = false;

function readBooleanEnv(name, fallbackValue) {
  const value = process.env[name];
  return value === undefined ? fallbackValue : value === "true";
}

function readPositiveNumberEnv(name, fallbackValue) {
  const parsedValue = Number(process.env[name]);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallbackValue;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

export function getTestDriveReminderJobConfig(overrides = {}) {
  return {
    enabled: readBooleanEnv("TEST_DRIVE_REMINDER_ENABLED", true),
    intervalMinutes: readPositiveNumberEnv(
      "TEST_DRIVE_REMINDER_INTERVAL_MINUTES",
      DEFAULT_INTERVAL_MINUTES
    ),
    windowHours: readPositiveNumberEnv(
      "TEST_DRIVE_REMINDER_WINDOW_HOURS",
      DEFAULT_WINDOW_HOURS
    ),
    dryRun: readBooleanEnv("TEST_DRIVE_REMINDER_DRY_RUN", false),
    ...overrides,
  };
}

export function parseAppointmentDateTime(booking = {}) {
  const appointmentDate = firstNonEmptyString(
    booking.appointmentDate,
    booking.date,
    booking.booking_date
  );

  const appointmentTime = firstNonEmptyString(
    booking.appointmentTime,
    booking.timeSlot,
    booking.time_slot,
    booking.time
  );

  if (!appointmentDate || !appointmentTime) {
    return null;
  }

  const normalizedTime = TIME_SLOT_PATTERN.test(appointmentTime)
    ? `${appointmentTime}:00`
    : appointmentTime;

  const parsedDate = new Date(`${appointmentDate}T${normalizedTime}`);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function getHoursUntilAppointment(booking, now = new Date()) {
  const appointmentDateTime = parseAppointmentDateTime(booking);

  if (!appointmentDateTime) {
    return null;
  }

  return (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
}

export function isWithinReminderWindow(
  hoursUntilAppointment,
  windowHours = DEFAULT_WINDOW_HOURS,
  toleranceHours = WINDOW_TOLERANCE_HOURS
) {
  if (hoursUntilAppointment === null || Number.isNaN(hoursUntilAppointment)) {
    return false;
  }

  return (
    hoursUntilAppointment >= windowHours - toleranceHours &&
    hoursUntilAppointment <= windowHours + toleranceHours
  );
}

/**
 * Runs one reminder sweep. Exported so it can be triggered by the scheduler,
 * by an external cron/deployment scheduler, or by the automated test suite.
 */
export async function runTestDriveReminderCheck(options = {}) {
  const config = getTestDriveReminderJobConfig(options);
  const now = config.now instanceof Date ? config.now : new Date();

  const report = {
    runId: randomUUID(),
    checkedAt: now.toISOString(),
    windowHours: config.windowHours,
    intervalMinutes: config.intervalMinutes,
    dryRun: config.dryRun,
    scanned: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    alreadyReminded: 0,
    results: [],
  };

  const bookings = await db
    .collection("bookings")
    .find({ status: "confirmed" })
    .toArray();

  report.scanned = bookings.length;

  for (const booking of bookings) {
    if (booking.reminderSent) {
      report.alreadyReminded += 1;
      continue;
    }

    const hoursUntilAppointment = getHoursUntilAppointment(booking, now);

    if (!isWithinReminderWindow(hoursUntilAppointment, config.windowHours)) {
      continue;
    }

    report.eligible += 1;

    const bookingReference = {
      bookingId: booking.id ?? booking._id ?? null,
      recipient: booking.user_email || booking.email || "",
      hoursUntilAppointment:
        hoursUntilAppointment === null
          ? null
          : Math.round(hoursUntilAppointment * 100) / 100,
    };

    if (config.dryRun) {
      report.results.push({
        ...bookingReference,
        sent: false,
        skipped: true,
        reason: "Dry run enabled. No reminder email was sent.",
      });
      continue;
    }

    try {
      const delivery = await sendTestDriveReminder(booking);

      if (!delivery.sent) {
        report.failed += 1;
        report.results.push({
          ...bookingReference,
          sent: false,
          reason: delivery.reason,
        });
        continue;
      }

      await db.collection("bookings").updateOne(
        { _id: booking._id },
        {
          $set: {
            reminderSent: true,
            reminderSentAt: now.toISOString(),
          },
        }
      );

      report.sent += 1;
      report.results.push({
        ...bookingReference,
        sent: true,
        reason: delivery.reason,
      });
    } catch (error) {
      report.failed += 1;
      report.results.push({
        ...bookingReference,
        sent: false,
        reason: error.message,
      });
    }
  }

  return report;
}

async function runScheduledCheck(config) {
  if (isCheckRunning) {
    console.log(
      "Test drive reminder check skipped because the previous run is still in progress."
    );
    return null;
  }

  isCheckRunning = true;

  try {
    const report = await runTestDriveReminderCheck(config);

    console.log(
      `Test drive reminder check complete: ${report.sent} sent, ${report.failed} failed, ${report.eligible} in window, ${report.scanned} scanned.`
    );

    return report;
  } catch (error) {
    console.error("Test drive reminder job failed:", error.message);
    return null;
  } finally {
    isCheckRunning = false;
  }
}

/**
 * Starts the background reminder checker.
 *
 * The interval is unref'd so it never keeps the process alive on its own and
 * the job can be stopped deterministically during tests.
 */
export function startTestDriveReminderJob(overrides = {}) {
  const config = getTestDriveReminderJobConfig(overrides);

  if (!config.enabled) {
    console.log(
      "Test drive reminder job is disabled. Set TEST_DRIVE_REMINDER_ENABLED=true to enable it."
    );
    return { started: false, reason: "Reminder job is disabled.", config };
  }

  if (reminderInterval) {
    return {
      started: false,
      reason: "Reminder job is already running.",
      config,
    };
  }

  const intervalMs = config.intervalMinutes * 60 * 1000;

  reminderInterval = setInterval(() => {
    void runScheduledCheck(config);
  }, intervalMs);

  if (typeof reminderInterval.unref === "function") {
    reminderInterval.unref();
  }

  console.log(
    `Test drive reminder job started. Checking every ${config.intervalMinutes} minute(s) for appointments approximately ${config.windowHours} hour(s) away.`
  );

  // Run an immediate sweep so a restart does not delay pending reminders.
  void runScheduledCheck(config);

  return { started: true, config };
}

export function stopTestDriveReminderJob() {
  if (!reminderInterval) {
    return { stopped: false };
  }

  clearInterval(reminderInterval);
  reminderInterval = null;

  return { stopped: true };
}

export default {
  getTestDriveReminderJobConfig,
  parseAppointmentDateTime,
  getHoursUntilAppointment,
  isWithinReminderWindow,
  runTestDriveReminderCheck,
  startTestDriveReminderJob,
  stopTestDriveReminderJob,
};
