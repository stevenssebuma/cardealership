import db from "../config/db.js";

export const TIME_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
];
const ACTIVE_STATUSES = ["pending", "confirmed", "completed"];

function formatBooking(row) {
  return {
    id: row.id,
    userId: row.user_id,
    carId: row.car_id,
    carModel: row.car_model,
    date: row.preferred_date,
    timeSlot: row.preferred_time,
    status: row.status,
    notes: row.notes,
    user_name: row.user_name,
    user_email: row.user_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
  };
}

function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

export async function createBooking(req, res) {
  const carId = Number(req.body.car_id ?? req.body.carId);
  const date = String(req.body.date ?? req.body.appointmentDate ?? "");
  const timeSlot = String(
    req.body.time_slot ?? req.body.timeSlot ?? req.body.appointmentTime ?? "",
  );
  if (
    !Number.isInteger(carId) ||
    carId <= 0 ||
    !validDate(date) ||
    !TIME_SLOTS.includes(timeSlot)
  ) {
    return res.status(400).json({
      success: false,
      error: "A valid car, date, and available time slot are required.",
      availableSlots: TIME_SLOTS,
    });
  }

  try {
    const car = await db.query(
      `SELECT id, name, make, model FROM cars WHERE id = $1 AND is_available = TRUE AND COALESCE(status, 'Available') NOT IN ('Sold', 'Deleted')`,
      [carId],
    );
    if (!car.rows[0])
      return res.status(404).json({
        success: false,
        error: "The selected vehicle is unavailable.",
      });

    const inserted = await db.query(
      `INSERT INTO test_drives (user_id, car_id, preferred_date, preferred_time, notes, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING *`,
      [
        req.user.id,
        carId,
        date,
        timeSlot,
        String(req.body.notes || "").trim() || null,
      ],
    );
    const booking = {
      ...inserted.rows[0],
      car_model: [car.rows[0].make, car.rows[0].model || car.rows[0].name]
        .filter(Boolean)
        .join(" "),
      user_name: req.user.name,
      user_email: req.user.email,
    };
    return res.status(201).json({
      success: true,
      booking: formatBooking(booking),
      message: `Test drive requested for ${date} at ${timeSlot}`,
    });
  } catch (error) {
    if (error.code === "23505")
      return res.status(409).json({
        success: false,
        error: "Time slot already booked for this car",
        conflict: true,
      });
    console.error("Booking creation failed:", error);
    return res
      .status(500)
      .json({ success: false, error: "Booking could not be created." });
  }
}

export async function checkAvailability(req, res) {
  const carId = Number(req.query.car_id ?? req.query.carId);
  const date = String(req.query.date || "");
  if (!Number.isInteger(carId) || carId <= 0 || !validDate(date))
    return res
      .status(400)
      .json({ success: false, error: "A valid car_id and date are required." });
  const result = await db.query(
    `SELECT preferred_time FROM test_drives WHERE car_id = $1 AND preferred_date = $2 AND status = ANY($3::varchar[])`,
    [carId, date, ACTIVE_STATUSES],
  );
  const bookedSlots = result.rows.map((row) => row.preferred_time);
  return res.json({
    success: true,
    car_id: carId,
    date,
    availableSlots: TIME_SLOTS.filter((slot) => !bookedSlots.includes(slot)),
    allSlots: TIME_SLOTS,
  });
}

async function getBookings(whereSql, params) {
  const result = await db.query(
    `SELECT td.*, u.name AS user_name, u.email AS user_email, CONCAT_WS(' ', c.make, COALESCE(c.model, c.name)) AS car_model
     FROM test_drives td JOIN users u ON u.id = td.user_id JOIN cars c ON c.id = td.car_id
     ${whereSql} ORDER BY td.preferred_date ASC, td.preferred_time ASC, td.id ASC`,
    params,
  );
  return result.rows.map(formatBooking);
}

export async function getMyBookings(req, res) {
  const bookings = await getBookings("WHERE td.user_id = $1", [req.user.id]);
  return res.json({
    success: true,
    user_id: req.user.id,
    total: bookings.length,
    bookings,
  });
}

export async function getBookingsForUser(req, res) {
  const requestedId = Number(req.params.user_id);
  if (!Number.isInteger(requestedId) || requestedId <= 0)
    return res.status(400).json({ success: false, error: "Invalid user ID" });
  if (req.user.role !== "admin" && requestedId !== req.user.id)
    return res
      .status(403)
      .json({ success: false, error: "You can only view your own bookings." });
  const bookings = await getBookings("WHERE td.user_id = $1", [requestedId]);
  return res.json({
    success: true,
    user_id: requestedId,
    total: bookings.length,
    bookings,
  });
}

export async function cancelBooking(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res
      .status(400)
      .json({ success: false, error: "Invalid booking ID" });
  const result = await db.query(`SELECT * FROM test_drives WHERE id = $1`, [
    id,
  ]);
  const booking = result.rows[0];
  if (!booking)
    return res.status(404).json({ success: false, error: "Booking not found" });
  if (req.user.role !== "admin" && booking.user_id !== req.user.id)
    return res
      .status(403)
      .json({ success: false, error: "You can only cancel your own booking." });
  if (booking.status === "cancelled")
    return res
      .status(422)
      .json({ success: false, error: "Booking already cancelled" });
  const updated = await db.query(
    `UPDATE test_drives SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );
  const enriched = {
    ...updated.rows[0],
    car_model: null,
    user_name: req.user.name,
    user_email: req.user.email,
  };
  return res.json({
    success: true,
    booking: formatBooking(enriched),
    message: "Booking cancelled successfully",
  });
}

export async function listAdminBookings(_req, res) {
  const bookings = await getBookings("", []);
  return res.json({ success: true, data: bookings, total: bookings.length });
}

export async function updateBookingStatus(req, res) {
  const id = Number(req.params.id);
  const status = String(req.body.status || "").toLowerCase();
  const expectedUpdatedAt = req.body.expectedUpdatedAt
    ? String(req.body.expectedUpdatedAt)
    : null;
  const transitions = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };
  if (!Number.isInteger(id) || id <= 0 || !Object.hasOwn(transitions, status))
    return res.status(422).json({
      success: false,
      code: "VALIDATION_FAILED",
      message: "A supported booking status is required.",
      allowedStatuses: Object.keys(transitions),
    });
  const current = await db.query(`SELECT * FROM test_drives WHERE id = $1`, [
    id,
  ]);
  const booking = current.rows[0];
  if (!booking)
    return res.status(404).json({
      success: false,
      code: "BOOKING_NOT_FOUND",
      message: "Booking not found.",
    });
  if (!transitions[booking.status]?.includes(status))
    return res.status(422).json({
      success: false,
      code: "INVALID_TRANSITION",
      currentStatus: booking.status,
      allowedTransitions: transitions[booking.status] || [],
    });
  if (
    expectedUpdatedAt &&
    new Date(booking.updated_at).toISOString() !==
      new Date(expectedUpdatedAt).toISOString()
  )
    return res.status(409).json({
      success: false,
      code: "STALE_STATE",
      message: "The booking changed after it was loaded.",
      booking: formatBooking(booking),
    });
  const updated = await db.query(
    `UPDATE test_drives SET status = $2::varchar, cancelled_at = CASE WHEN $2::varchar = 'cancelled' THEN NOW() ELSE cancelled_at END, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return res.json({ success: true, booking: formatBooking(updated.rows[0]) });
}
