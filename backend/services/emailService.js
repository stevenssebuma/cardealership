// backend/services/emailService.js
//
// Sprint 6 - Automated Test Drive Email Pipeline
//
// Transactional email module used by the test drive booking lifecycle:
// - sendTestDriveConfirmation() is triggered by POST /api/bookings/create.
// - sendTestDriveReminder() is triggered by the 24 hour reminder background
//   checker in jobs/testDriveReminderJob.js.
//
// Provider behaviour:
// - EMAIL_PROVIDER=nodemailer uses the shared config/email.js contract
//   (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM).
// - When the configured provider is not fully configured, the module falls
//   back to the Ethereal test account (ETHEREAL_USER / ETHEREAL_PASSWORD) so
//   the pipeline stays testable without production credentials.
// - When neither is configured the send is skipped safely (never throws), so a
//   booking is never lost because of an email problem.

import nodemailer from "nodemailer";

import {
  getEmailConfig,
  getEmailProvider,
  isEmailProviderConfigured,
} from "../config/email.js";

import { buildAppointmentConfirmationTemplate } from "../templates/appointmentConfirmation.js";
import { buildTestDriveReminderTemplate } from "../templates/testDriveReminder.js";

export const DEALERSHIP_NOTIFICATION_CONTEXT = {
  dealershipName: "Panda Motors",
  dealershipPhone: "+256 770 826 951",
};

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

export function isValidRecipientEmail(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  const atIndex = value.indexOf("@");
  const dotIndex = value.lastIndexOf(".");

  return atIndex > 0 && dotIndex > atIndex + 1 && dotIndex < value.length - 1;
}

/**
 * Booking records reach this service with different field names depending on
 * whether they come from the booking route payload or from the data store, so
 * every field is normalized once here.
 */
export function normalizeTestDriveBooking(booking = {}) {
  return {
    customerName: firstNonEmptyString(
      booking.customerName,
      booking.user_name,
      booking.name,
      booking.userName
    ),
    customerEmail: firstNonEmptyString(
      booking.customerEmail,
      booking.user_email,
      booking.email,
      booking.to
    ),
    vehicleName:
      firstNonEmptyString(
        booking.vehicleName,
        booking.carModel,
        booking.car_model,
        booking.carName
      ) || "your selected vehicle",
    appointmentDate: firstNonEmptyString(
      booking.appointmentDate,
      booking.date,
      booking.booking_date
    ),
    appointmentTime: firstNonEmptyString(
      booking.appointmentTime,
      booking.timeSlot,
      booking.time_slot,
      booking.time
    ),
    reference: firstNonEmptyString(booking.reference, booking.bookingReference),
  };
}

/**
 * Resolves the transport used for the next send.
 * Returns null when no provider is ready, which keeps the pipeline safe.
 */
export function resolveEmailTransport() {
  const provider = getEmailProvider();

  if (provider === "nodemailer" && isEmailProviderConfigured(provider)) {
    const config = getEmailConfig();

    return {
      provider: "nodemailer",
      from: config.from,
      replyTo: config.replyTo,
      transport: {
        host: config.nodemailer.host,
        port: Number(config.nodemailer.port),
        secure: config.nodemailer.secure,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      },
    };
  }

  const etherealUser = process.env.ETHEREAL_USER;
  const etherealPassword = process.env.ETHEREAL_PASSWORD;

  if (etherealUser && etherealPassword) {
    return {
      provider: "ethereal",
      from: etherealUser,
      replyTo: etherealUser,
      transport: {
        host: process.env.ETHEREAL_HOST || "smtp.ethereal.email",
        port: Number(process.env.ETHEREAL_PORT || 587),
        secure: false,
        auth: {
          user: etherealUser,
          pass: etherealPassword,
        },
      },
    };
  }

  return null;
}

export function getTestDriveEmailPipelineStatus() {
  const transport = resolveEmailTransport();

  return {
    configured: Boolean(transport),
    provider: transport ? transport.provider : getEmailProvider(),
    from: transport ? transport.from : getEmailConfig().from,
    usesFallbackTransport: Boolean(
      transport && transport.provider === "ethereal"
    ),
  };
}

async function deliverTestDriveEmail({ message, booking, templateName }) {
  const normalizedBooking = normalizeTestDriveBooking(booking);

  const baseResult = {
    template: templateName,
    recipient: normalizedBooking.customerEmail,
    attempted: false,
    sent: false,
    skipped: false,
    provider: getEmailProvider(),
    reason: "",
  };

  if (!isValidRecipientEmail(normalizedBooking.customerEmail)) {
    return {
      ...baseResult,
      skipped: true,
      reason:
        "A valid customer email address is required before an email can be sent.",
    };
  }

  if (
    !normalizedBooking.appointmentDate ||
    !normalizedBooking.appointmentTime
  ) {
    return {
      ...baseResult,
      skipped: true,
      reason:
        "The appointment date and time are required before an email can be sent.",
    };
  }

  const transportConfig = resolveEmailTransport();

  if (!transportConfig) {
    return {
      ...baseResult,
      skipped: true,
      reason:
        "No transactional email provider is configured. Set EMAIL_PROVIDER with its credentials, or the ETHEREAL_* test credentials.",
    };
  }

  const emailMessage = message(normalizedBooking);

  const mailOptions = {
    from: transportConfig.from,
    to: normalizedBooking.customerEmail,
    replyTo: transportConfig.replyTo,
    subject: emailMessage.subject,
    text: emailMessage.text,
    html: emailMessage.html,
  };

  try {
    const transporter = nodemailer.createTransport(transportConfig.transport);
    const info = await transporter.sendMail(mailOptions);

    let previewUrl = null;

    try {
      previewUrl = nodemailer.getTestMessageUrl(info) || null;
    } catch {
      previewUrl = null;
    }

    console.log(
      `Test drive ${templateName} email sent to ${normalizedBooking.customerEmail}`
    );

    if (previewUrl) {
      console.log("Email preview URL:", previewUrl);
    }

    return {
      ...baseResult,
      attempted: true,
      sent: true,
      provider: transportConfig.provider,
      messageId: info.messageId,
      previewUrl,
      reason: "Email delivery succeeded.",
    };
  } catch (error) {
    console.error(
      `Test drive ${templateName} email failed:`,
      error.message
    );

    return {
      ...baseResult,
      attempted: true,
      provider: transportConfig.provider,
      error: error.message,
      reason: "Email delivery failed. The booking was not affected.",
    };
  }
}

/**
 * Immediate receipt sent right after a test drive slot is booked.
 */
export async function sendTestDriveConfirmation(booking) {
  return deliverTestDriveEmail({
    booking,
    templateName: "confirmation",
    message: (normalizedBooking) =>
      buildAppointmentConfirmationTemplate({
        ...DEALERSHIP_NOTIFICATION_CONTEXT,
        ...normalizedBooking,
        to: normalizedBooking.customerEmail,
      }),
  });
}

/**
 * Reminder sent by the background checker 24 hours before the appointment.
 */
export async function sendTestDriveReminder(booking) {
  return deliverTestDriveEmail({
    booking,
    templateName: "reminder",
    message: (normalizedBooking) =>
      buildTestDriveReminderTemplate({
        ...DEALERSHIP_NOTIFICATION_CONTEXT,
        ...normalizedBooking,
        to: normalizedBooking.customerEmail,
      }),
  });
}