import type { TestDriveBookingNotification } from "../types";

/**
 * Builds the delivery sentence shown on the booking receipt.
 *
 * The backend always saves the booking, but the confirmation email can be
 * skipped (no provider configured, invalid address) or fail (SMTP rejection).
 * The receipt must never promise an email that was not accepted by the server.
 */
export function getConfirmationEmailMessage(
  notification: TestDriveBookingNotification | undefined,
  phone: string,
): string {
  const contactNumber = phone.trim() || "your phone number";

  if (notification?.sent) {
    return `A confirmation email with the appointment details is on its way to your account address. Our team will call you on ${contactNumber} if anything about the slot needs to change.`;
  }

  if (notification) {
    return `Your booking is saved, but the confirmation email could not be sent. Our team will call you on ${contactNumber} to confirm the appointment.`;
  }

  return `Our team will call you on ${contactNumber} if anything about the slot needs to change.`;
}
