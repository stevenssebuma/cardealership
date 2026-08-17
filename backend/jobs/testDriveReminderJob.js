import cron from "node-cron";
import db from "../config/database.js";
import { sendTestDriveReminder } from "../services/emailService.js";

export const startTestDriveReminderJob = () => {
  // Run every hour
  cron.schedule("* * * * *", async () => {
    console.log("⏰ Checking for upcoming test drives...");

    try {
      const bookings = await db.collection("bookings").find({
        status: "confirmed"
      }).toArray();

      const now = new Date();

      for (const booking of bookings) {
        const appointmentDateTime = new Date(
          `${booking.date}T${booking.timeSlot}:00`
        );

        const hoursUntilAppointment =
          (appointmentDateTime - now) / (1000 * 60 * 60);

        // Send reminder when appointment is approximately
        // 24 hours away.
        if (
          hoursUntilAppointment >= 23 &&
          hoursUntilAppointment <= 25 &&
          !booking.reminderSent
        ) {
          console.log(
            `📧 Sending reminder to: ${booking.user_email}`
          );

          await sendTestDriveReminder(booking);

          await db.collection("bookings").updateOne(
            { _id: booking._id },
            {
              $set: {
                reminderSent: true,
                reminderSentAt: new Date().toISOString()
              }
            }
          );

          console.log("✅ Reminder email sent!");
        }
      }

    } catch (error) {
      console.error(
        "❌ Test drive reminder job failed:",
        error.message
      );
    }
  });

  console.log("✅ Test drive reminder job started");
};