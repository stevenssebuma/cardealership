import nodemailer from "nodemailer";

import {
  getEmailConfig,
  getEmailProvider,
  getRedactedEmailConfig,
  getRequiredEmailEnvironmentKeys,
  isEmailProviderConfigured,
} from "../config/email.js";

import { buildAppointmentConfirmationTemplate } from "../templates/appointmentConfirmation.js";

function isValidEmail(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  const atIndex = value.indexOf("@");
  const dotIndex = value.lastIndexOf(".");

  return (
    atIndex > 0 &&
    dotIndex > atIndex + 1 &&
    dotIndex < value.length - 1
  );
}

export function validateAppointmentNotificationPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== "object") {
    return ["Notification payload is required."];
  }

  if (!isValidEmail(payload.to)) {
    errors.push("A valid recipient email is required.");
  }

  if (!payload.customerName || typeof payload.customerName !== "string") {
    errors.push("Customer name is required.");
  }

  if (!payload.vehicleName && !payload.vehicleId) {
    errors.push("Vehicle name or vehicle ID is required.");
  }

  if (!payload.appointmentDate || typeof payload.appointmentDate !== "string") {
    errors.push("Appointment date is required.");
  }

  if (!payload.appointmentTime || typeof payload.appointmentTime !== "string") {
    errors.push("Appointment time is required.");
  }

  return errors;
}

export function buildAppointmentConfirmationMessage(payload) {
  return buildAppointmentConfirmationTemplate(payload);
}

export function getNotificationServiceStatus() {
  return {
    provider: getEmailProvider(),
    configured: isEmailProviderConfigured(),
    requiredEnvironmentKeys: getRequiredEmailEnvironmentKeys(),
    config: getRedactedEmailConfig(),
  };
}

export async function sendAppointmentConfirmationEmail(payload) {
  const errors = validateAppointmentNotificationPayload(payload);

  if (errors.length > 0) {
    return {
      sent: false,
      skipped: false,
      reason: "Invalid notification payload.",
      errors,
    };
  }

  const message = buildAppointmentConfirmationMessage(payload);
  const provider = getEmailProvider();
  const configured = isEmailProviderConfigured();

  if (!configured) {
    return {
      sent: false,
      skipped: true,
      provider,
      reason: "Email provider is not configured.",
      requiredEnvironmentKeys: getRequiredEmailEnvironmentKeys(),
      message,
    };
  }

  if (provider !== "nodemailer") {
    return {
      sent: false,
      skipped: true,
      provider,
      reason: `Email provider '${provider}' is not supported by this transport.`,
      message,
    };
  }

  const config = getEmailConfig();

  const transporter = nodemailer.createTransport({
    host: config.nodemailer.host,
    port: Number(config.nodemailer.port),
    secure: config.nodemailer.secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  try {
    const mailOptions = {
      from: config.from,
      to: payload.to,
      replyTo: config.replyTo,
      subject: "Panda Motors - Test Drive Confirmation",
    };

    if (typeof message === "string") {
      mailOptions.html = message;
    } else {
      mailOptions.html = message.html;
      mailOptions.text = message.text;
      mailOptions.subject =
        message.subject || "Panda Motors - Test Drive Confirmation";
    }

    const info = await transporter.sendMail(mailOptions);

    return {
      sent: true,
      skipped: false,
      provider: "nodemailer",
      messageId: info.messageId,
      reason: "Appointment confirmation email sent successfully.",
    };
  } catch (error) {
    console.error("Nodemailer email error:", error.message);

    return {
      sent: false,
      skipped: false,
      provider: "nodemailer",
      reason: "Failed to send appointment confirmation email.",
      error: error.message,
    };
  }
}