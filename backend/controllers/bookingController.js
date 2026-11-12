import db from '../config/db.js';
import { sendTestDriveConfirmation } from '../services/emailService.js';
import { BOOKING_TIME_SLOTS } from '../utils/validators.js';
import { checkUserBookingLimits } from '../services/availabilityService.js';

const TIME_SLOTS = BOOKING_TIME_SLOTS;
const MAX_NOTES_LENGTH = 500;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function serializeBooking(row) {
  return {
    id: row.id,
    userId: row.user_id,
    carId: row.car_id,
    carModel: row.car_model ?? null,
    date: toDateOnly(row.booking_date),
    timeSlot: row.time_slot,
    status: row.status,
    notes: row.notes ?? '',
    user_name: row.user_name ?? null,
    user_email: row.user_email ?? null,
    user_phone: row.user_phone ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

const BOOKING_SELECT = `
  SELECT
    b.id,
    b.user_id,
    b.car_id,
    b.booking_date,
    b.time_slot,
    b.status,
    b.notes,
    b.created_at,
    b.updated_at,
    TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date_text,
    c.name AS car_model,
    u.name AS user_name,
    u.email AS user_email
  FROM bookings b
  LEFT JOIN cars c ON c.id = b.car_id
  LEFT JOIN users u ON u.id = b.user_id
`;

function serializeRow(row) {
  return serializeBooking({ ...row, booking_date: row.booking_date_text ?? row.booking_date });
}

function isPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0;
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* ------------------------------------------------------------------ *
 * POST /api/bookings/create
 * ------------------------------------------------------------------ */

export async function createBooking(req, res) {
  try {
    const {
      car_id,
      car_model,
      date,
      time_slot,
      user_name,
      user_phone,
      notes,
    } = req.body || {};

    // The booking belongs to the authenticated account. A `user_id` in the body
    // is ignored on purpose: trusting it let any client create bookings in
    // another customer's name and burn their booking allowance.
    const authenticatedUserId = Number(req.user?.id);

    if (!isPositiveInteger(authenticatedUserId)) {
      return res.status(401).json({
        success: false,
        error: 'User authentication is required',
      });
    }

    const claimedUserId = Number(req.body?.user_id);

    if (
      Number.isInteger(claimedUserId) &&
      claimedUserId > 0 &&
      claimedUserId !== authenticatedUserId
    ) {
      console.warn(
        `Ignoring booking user_id ${claimedUserId}: request is authenticated as ${authenticatedUserId}`,
      );
    }

    const numericUserId = authenticatedUserId;

    if (!car_id || !date || !time_slot) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['car_id', 'date', 'time_slot'],
      });
    }

    if (!TIME_SLOTS.includes(time_slot)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time slot',
        availableSlots: TIME_SLOTS,
      });
    }

    if (!isPositiveInteger(car_id)) {
      return res.status(400).json({
        success: false,
        error: 'car_id must be a positive number',
      });
    }

    if (!isDateString(date)) {
      return res.status(400).json({
        success: false,
        error: 'date must use the format YYYY-MM-DD',
      });
    }

    // ISO dates compare correctly as strings.
    if (date < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({
        success: false,
        error: 'Booking date cannot be in the past',
      });
    }

    const numericCarId = Number(car_id);

    const car = await db.query('SELECT id, name FROM cars WHERE id = $1', [numericCarId]);

    if (car.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    const conflict = await db.query(
      `SELECT id FROM bookings
       WHERE car_id = $1 AND booking_date = $2::date AND time_slot = $3
         AND status NOT IN ('cancelled','completed')
       LIMIT 1`,
      [numericCarId, date, time_slot]
    );

    if (conflict.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Time slot already booked for this car',
        conflict: true,
      });
    }

    const limitCheck = await checkUserBookingLimits(numericUserId);

    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: limitCheck.message,
      });
    }

    const trimmedNotes =
      typeof notes === 'string' && notes.trim() !== ''
        ? notes.trim().slice(0, MAX_NOTES_LENGTH)
        : null;

    const inserted = await db.query(
      `INSERT INTO bookings (user_id, car_id, booking_date, time_slot, notes, status)
       VALUES ($1, $2, $3::date, $4, $5, 'confirmed')
       RETURNING id, created_at`,
      [numericUserId, numericCarId, date, time_slot, trimmedNotes]
    );

    const bookingId = inserted.rows[0]?.id ?? null;

    // The confirmation always goes to the account address that owns the token.
    // A body-supplied address is ignored so the endpoint cannot be used to mail
    // arbitrary recipients.
    const accountEmail =
      typeof req.user?.email === 'string' ? req.user.email.trim() : '';
    const accountName =
      typeof req.user?.name === 'string' ? req.user.name.trim() : '';
    const contactName =
      typeof user_name === 'string' && user_name.trim() !== ''
        ? user_name.trim()
        : accountName || 'Guest';

    const booking = {
      id: bookingId,
      userId: numericUserId,
      carId: numericCarId,
      carModel: car_model || car.rows[0].name || 'Unknown Model',
      date: toDateOnly(date),
      timeSlot: time_slot,
      status: 'confirmed',
      notes: trimmedNotes ?? '',
      user_name: contactName,
      user_email: accountEmail,
      user_phone: user_phone || '',
      createdAt: inserted.rows[0]?.created_at ?? new Date().toISOString(),
    };

    const notification = await notifyCustomer(booking);

    return res.status(201).json({
      success: true,
      booking,
      message: `Test drive booked for ${booking.date} at ${time_slot}`,
      notification,
    });
  } catch (error) {
    console.error('Booking creation failed:', error.message);

    // 23503 = foreign key violation: the referenced user or vehicle is gone.
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        error: 'Unknown user or vehicle',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/**
 * The booking is already persisted when this runs, so a delivery problem can
 * never fail the request.
 */
async function notifyCustomer(booking) {
  if (!booking.user_email) {
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: 'No customer email address was provided.',
    };
  }

  try {
    const delivery = await sendTestDriveConfirmation({
      customerName: booking.user_name,
      customerEmail: booking.user_email,
      vehicleName: booking.carModel,
      vehicleId: booking.carId,
      appointmentDate: booking.date,
      appointmentTime: booking.timeSlot,
      reference: `TD-${booking.id}`,
    });

    if (delivery.sent) {
      console.log('Confirmation email sent to:', booking.user_email);
    } else {
      console.warn('Confirmation email was not sent:', delivery.reason);
    }

    return {
      attempted: delivery.attempted === true,
      sent: delivery.sent === true,
      skipped: delivery.skipped === true,
      provider: delivery.provider,
      reason: delivery.reason,
    };
  } catch (emailError) {
    console.error('Booking confirmation email failed:', emailError.message);

    return {
      attempted: true,
      sent: false,
      skipped: false,
      reason: 'Booking succeeded but email delivery failed.',
    };
  }
}

/* ------------------------------------------------------------------ *
 * GET /api/bookings/check-availability
 * ------------------------------------------------------------------ */

export async function getAvailability(req, res) {
  try {
    const { car_id, date } = req.query;

    if (!car_id || !date) {
      return res.status(400).json({
        error: 'Missing required query parameters',
        required: ['car_id', 'date'],
      });
    }

    if (!isDateString(date)) {
      return res.status(400).json({
        error: 'date must use the format YYYY-MM-DD',
      });
    }

    const result = await db.query(
      `SELECT time_slot FROM bookings
       WHERE car_id = $1 AND booking_date = $2::date
         AND status NOT IN ('cancelled','completed')`,
      [car_id, date]
    );

    const bookedSlots = result.rows.map((row) => row.time_slot);
    const availableSlots = TIME_SLOTS.filter((slot) => !bookedSlots.includes(slot));

    return res.json({
      success: true,
      car_id,
      date,
      availableSlots,
      allSlots: TIME_SLOTS,
      message: availableSlots.length > 0
        ? 'Available slots found'
        : 'No available slots for this date',
    });
  } catch (error) {
    console.error('Availability check error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/* ------------------------------------------------------------------ *
 * GET /api/bookings/me
 * ------------------------------------------------------------------ */

export async function getMyBookings(req, res) {
  try {
    const userId = Number(req.user?.id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication is required',
      });
    }

    const result = await db.query(
      `${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.booking_date ASC, b.id ASC`,
      [userId]
    );

    const bookings = result.rows.map(serializeRow);

    return res.json({
      success: true,
      userId,
      total: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error('Current user bookings error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/* ------------------------------------------------------------------ *
 * GET /api/bookings/user/:user_id
 * ------------------------------------------------------------------ */

export async function getUserBookings(req, res) {
  try {
    const userId = Number(req.params.user_id);

    if (!isPositiveInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // The path id must be the caller's own account; only an admin may look at
    // someone else's history.
    const authenticatedUserId = Number(req.user?.id);

    if (!isPositiveInteger(authenticatedUserId)) {
      return res.status(401).json({
        success: false,
        error: 'User authentication is required',
      });
    }

    if (authenticatedUserId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own bookings',
      });
    }

    const result = await db.query(
      `${BOOKING_SELECT}
       WHERE b.user_id = $1 AND b.status <> 'cancelled'
       ORDER BY b.booking_date ASC, b.id ASC`,
      [userId]
    );

    const bookings = result.rows.map(serializeRow);

    return res.json({
      success: true,
      user_id: userId,
      total: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error('User bookings error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/* ------------------------------------------------------------------ *
 * GET /api/admin/users/:user_id/bookings
 *
 * Admin-only view of one customer's complete history. Unlike the
 * customer-facing /api/bookings/user/:user_id route this keeps cancelled
 * bookings, because staff need to see what was called off.
 * ------------------------------------------------------------------ */

export async function getUserBookingsForAdmin(req, res) {
  try {
    const userId = Number(req.params.user_id);

    if (!isPositiveInteger(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const customer = await db.query(
      `SELECT id, name, email, role, phone, created_at
       FROM users
       WHERE id = $1`,
      [userId],
    );

    if (customer.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
    }

    const result = await db.query(
      `${BOOKING_SELECT}
       WHERE b.user_id = $1
       ORDER BY b.booking_date DESC, b.id DESC`,
      [userId],
    );

    const bookings = result.rows.map(serializeRow);

    return res.json({
      success: true,
      user: customer.rows[0],
      total: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error('Admin customer bookings error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/* ------------------------------------------------------------------ *
 * PUT /api/bookings/:id/cancel
 * ------------------------------------------------------------------ */

export async function cancelBooking(req, res) {
  try {
    const bookingId = Number(req.params.id);

    if (!isPositiveInteger(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID' });
    }

    const authenticatedUserId = Number(req.user?.id);

    if (!isPositiveInteger(authenticatedUserId)) {
      return res.status(401).json({
        success: false,
        error: 'User authentication is required',
      });
    }

    const existing = await db.query(
      'SELECT id, user_id, status FROM bookings WHERE id = $1',
      [bookingId],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only the customer who owns the booking (or an admin) may cancel it.
    if (
      Number(existing.rows[0].user_id) !== authenticatedUserId &&
      req.user?.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        error: 'You can only cancel your own bookings',
      });
    }

    if (existing.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Booking already cancelled' });
    }

    await db.query(
      `UPDATE bookings
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [bookingId]
    );

    const updated = await db.query(`${BOOKING_SELECT} WHERE b.id = $1`, [bookingId]);

    return res.json({
      success: true,
      booking: updated.rows[0] ? serializeRow(updated.rows[0]) : null,
      message: 'Booking cancelled successfully',
    });
  } catch (error) {
    console.error('Cancel booking error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
