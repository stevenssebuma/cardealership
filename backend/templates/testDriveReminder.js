function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getVehicleLabel(payload) {
  if (payload.vehicleName) {
    return payload.vehicleName;
  }

  return "your selected vehicle";
}

export function buildTestDriveReminderTemplate(payload = {}) {
  const customerName = payload.customerName || "there";
  const vehicleLabel = getVehicleLabel(payload);
  const appointmentDate = payload.appointmentDate || "the selected date";
  const appointmentTime = payload.appointmentTime || "the selected time";
  const dealershipName = payload.dealershipName || "the dealership team";
  const dealershipPhone =
    payload.dealershipPhone || "the dealership contact line";

  const subject = `Reminder: your test drive for ${vehicleLabel} is tomorrow`;

  const text = [
    `Hello ${customerName},`,
    "",
    "This is a friendly reminder that your test drive is scheduled for tomorrow.",
    `Vehicle: ${vehicleLabel}`,
    `Date: ${appointmentDate}`,
    `Time: ${appointmentTime}`,
    "",
    `Please arrive with a valid driving licence. ${dealershipName} will contact you if any additional details are needed.`,
    `Contact: ${dealershipPhone}`,
    "",
    "Thank you for choosing us.",
  ].join("\n");

  const html = [
    "<div>",
    `  <p>Hello ${escapeHtml(customerName)},</p>`,
    "  <p>This is a friendly reminder that your test drive is scheduled for tomorrow.</p>",
    "  <ul>",
    `    <li><strong>Vehicle:</strong> ${escapeHtml(vehicleLabel)}</li>`,
    `    <li><strong>Date:</strong> ${escapeHtml(appointmentDate)}</li>`,
    `    <li><strong>Time:</strong> ${escapeHtml(appointmentTime)}</li>`,
    "  </ul>",
    "  <p>Please arrive with a valid driving licence.</p>",
    `  <p>Contact: ${escapeHtml(dealershipPhone)}</p>`,
    "  <p>Thank you for choosing us.</p>",
    "</div>",
  ].join("\n");

  return {
    to: payload.to,
    subject,
    text,
    html,
  };
}
