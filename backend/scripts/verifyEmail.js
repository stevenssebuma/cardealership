#!/usr/bin/env node
/**
 * Transactional email verifier.
 *
 * Exercises exactly the transport the booking pipeline resolves, so a passing
 * run means confirmation emails will actually be delivered:
 *
 *   1. prints the provider, sender and which environment keys are missing;
 *   2. opens an SMTP connection and authenticates (transporter.verify());
 *   3. with --to=<address>, sends one real confirmation email.
 *
 * Usage (from backend/):
 *   npm run email:verify
 *   npm run email:verify -- --to=sales@pandamotors.co.ug
 *
 * Exit codes: 0 ok, 1 not configured, 2 SMTP failure.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env explicitly so the script works from any directory.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { default: nodemailer } = await import("nodemailer");
const {
  getEmailConfig,
  getEmailProvider,
  getMissingEmailEnvironmentKeys,
  isEmailProviderConfigured,
} = await import("../config/email.js");
const {
  DEALERSHIP_NOTIFICATION_CONTEXT,
  getTestDriveEmailPipelineStatus,
  resolveEmailTransport,
} = await import("../services/emailService.js");
const { buildAppointmentConfirmationTemplate } = await import(
  "../templates/appointmentConfirmation.js"
);

function readOption(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length).trim() : "";
}

function printConfiguration() {
  const provider = getEmailProvider();
  const status = getTestDriveEmailPipelineStatus();
  const config = getEmailConfig();

  console.log("Transactional email configuration");
  console.log(`  EMAIL_PROVIDER : ${provider}`);
  console.log(
    `  transport      : ${status.provider || "none"}${
      status.usesFallbackTransport ? " (Ethereal fallback)" : ""
    }`,
  );
  console.log(`  EMAIL_FROM     : ${config.from || "not set"}`);
  console.log(`  reply-to       : ${config.replyTo || "not set"}`);

  if (provider === "nodemailer") {
    console.log(
      `  SMTP server    : ${config.nodemailer.host || "not set"}:${
        config.nodemailer.port || "?"
      } (secure=${config.nodemailer.secure})`,
    );
    console.log(
      `  EMAIL_USER     : ${config.nodemailer.userConfigured ? "set" : "missing"}`,
    );
    console.log(
      `  EMAIL_PASSWORD : ${config.nodemailer.passwordConfigured ? "set" : "missing"}`,
    );
  }

  return { provider, config };
}

async function main() {
  const { provider, config } = printConfiguration();

  if (!isEmailProviderConfigured(provider)) {
    const missingKeys = getMissingEmailEnvironmentKeys(provider);

    console.error(
      `\nFAILED: EMAIL_PROVIDER=${provider} is missing ${missingKeys.join(", ")}.`,
    );
    console.error(
      "Add them to backend/.env. Gmail rejects account passwords and needs 2-Step Verification plus an App Password.",
    );
    process.exitCode = 1;
    return;
  }

  const transportConfig = resolveEmailTransport();

  if (!transportConfig) {
    console.error(
      "\nFAILED: no transactional transport could be resolved for the current configuration.",
    );
    process.exitCode = 1;
    return;
  }

  const transporter = nodemailer.createTransport(transportConfig.transport);

  console.log("\nVerifying SMTP connection and credentials...");

  try {
    await transporter.verify();
    console.log("OK: the SMTP server accepted the connection and credentials.");
  } catch (error) {
    console.error(
      `FAILED: ${error.code || "SMTP error"} - ${error.message}`,
    );
    console.error(
      "535 means the username/password pair was rejected. Check the mailbox, the App Password and that EMAIL_HOST/EMAIL_PORT match the provider.",
    );
    process.exitCode = 2;
    return;
  }

  const recipient = readOption("to");

  if (!recipient) {
    console.log(
      "\nAdd --to=<address> to send one real confirmation email through this transport.",
    );
    return;
  }

  const message = buildAppointmentConfirmationTemplate({
    ...DEALERSHIP_NOTIFICATION_CONTEXT,
    customerName: "Delivery check",
    vehicleName: "Toyota Land Cruiser",
    appointmentDate: new Date().toISOString().slice(0, 10),
    appointmentTime: "10:00 AM",
    reference: "TD-VERIFY",
    to: recipient,
  });

  console.log(`\nSending a confirmation template to ${recipient}...`);

  try {
    const info = await transporter.sendMail({
      from: transportConfig.from || config.from,
      to: recipient,
      replyTo: transportConfig.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    console.log(`OK: delivered. messageId=${info.messageId}`);

    let previewUrl = null;

    try {
      previewUrl = nodemailer.getTestMessageUrl(info) || null;
    } catch {
      previewUrl = null;
    }

    if (previewUrl) {
      console.log(`Preview: ${previewUrl}`);
    } else {
      console.log("Check the inbox (and the spam folder) for the message.");
    }
  } catch (error) {
    console.error(
      `FAILED: ${error.code || "SMTP error"} - ${error.message}`,
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
