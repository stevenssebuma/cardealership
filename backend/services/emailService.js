import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false,
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASSWORD,
  },
});

export async function sendTestDriveConfirmation(booking) {
  const mailOptions = {
    from: process.env.ETHEREAL_USER,
    to: booking.user_email || booking.email,
    subject: "Test Drive Booking Confirmation",
    html: `
      <h2>Test Drive Booking Confirmed</h2>
      <p>Hello ${booking.user_name},</p>
      <p>Your test drive has been successfully booked.</p>

      <p>
        <strong>Car:</strong> ${booking.carModel}<br>
        <strong>Date:</strong> ${booking.date}<br>
        <strong>Time:</strong> ${booking.timeSlot}
      </p>

      <p>We look forward to seeing you.</p>
    `,
  };

  const info = await transporter.sendMail(mailOptions);

  console.log("✅ Confirmation email sent!");
  console.log("📧 Preview URL:", nodemailer.getTestMessageUrl(info));

  return info;
}

export async function sendTestDriveReminder(booking) {
  const mailOptions = {
    from: process.env.ETHEREAL_USER,
    to: booking.user_email,
    subject: "Test Drive Reminder",
    html: `
      <h2>Test Drive Reminder</h2>
      <p>Hello ${booking.user_name},</p>
      <p>Your test drive is scheduled for tomorrow.</p>

      <p>
        <strong>Date:</strong> ${booking.date}<br>
        <strong>Time:</strong> ${booking.timeSlot}
      </p>
    `,
  };

  const info = await transporter.sendMail(mailOptions);

  console.log("✅ Reminder email sent!");
  console.log("📧 Preview URL:", nodemailer.getTestMessageUrl(info));

  return info;
}