import db from '../config/db.js';
import { validateBookingRequest } from '../utils/validators.js';
import * as availabilityService from '../services/availabilityService.js';

export async function createBooking(req, res) {
  try {
    const { car_id, booking_date, time_slot, notes } = req.body;
    const user_id = req.user.id;

    const validation = validateBookingRequest({ car_id, booking_date, time_slot, notes });
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: validation.errors });
    }

    const outcome = await db.withTransaction(async (tx) => {
      // Serialize booking-limit and same-user/day checks for this customer.
      const user = await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user_id]);
      if (!user.rowCount) return { status: 401, body: { success: false, message: 'User not found' } };
      const limitCheck = await availabilityService.checkUserBookingLimits(user_id, tx);
      if (!limitCheck.allowed) return { status: 429, body: { success: false, message: limitCheck.message } };
      const car = await tx.query('SELECT id FROM cars WHERE id = $1 FOR KEY SHARE', [car_id]);
      if (!car.rowCount) return { status: 404, body: { success: false, message: 'Car not found' } };
      const availability = await availabilityService.checkSlotAvailability(tx, car_id, booking_date, time_slot);
      if (!availability.available) {
        return { status: 409, body: { success: false, message: 'This time slot is already booked', conflict: availability.conflict } };
      }
      const dup = await tx.query(
        `SELECT id FROM bookings WHERE user_id = $1 AND car_id = $2 AND booking_date = $3
         AND status NOT IN ('cancelled','completed')`,
        [user_id, car_id, booking_date]
      );
      if (dup.rowCount) return { status: 409, body: { success: false, message: 'You already have a booking for this car on this date' } };
      const result = await tx.query(
        `INSERT INTO bookings (user_id, car_id, booking_date, time_slot, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *, booking_date::text AS booking_date`,
        [user_id, car_id, booking_date, time_slot, notes || null]
      );
      return { status: 201, body: { success: true, message: 'Booking created successfully!', booking: result.rows[0] } };
    });
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'This time slot is already booked' });
    console.error('createBooking error:', err.code || 'BOOKING_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getAvailableSlots(req, res) {
  try {
    const { carId, date } = req.params;
    const availability = await availabilityService.getAvailableSlots(carId, date);
    res.json({ success: true, ...availability });
  } catch (err) {
    console.error('getAvailableSlots error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getWeeklyAvailability(req, res) {
  try {
    const { carId } = req.params;
    const startDate = req.query.startDate || new Date().toISOString().split('T')[0];
    const availability = await availabilityService.getWeeklyAvailability(carId, startDate);
    res.json({ success: true, week: availability });
  } catch (err) {
    console.error('getWeeklyAvailability error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function checkAvailability(req, res) {
  try {
    const { car_id, booking_date, time_slot } = req.query;
    if (!car_id || !booking_date || !time_slot) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }
    const availability = await availabilityService.checkSlotAvailability(null, car_id, booking_date, time_slot);
    res.json({
      success: true,
      isAvailable: availability.available,
      car_id, booking_date, time_slot,
      message: availability.available ? 'Available' : 'Already booked'
    });
  } catch (err) {
    console.error('checkAvailability error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function cancelBooking(req, res) {
  try {
    const { id } = req.params;
    const user_id = req.user.id;
    const result = await db.query(
      `UPDATE bookings SET status='cancelled', updated_at=CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status IN ('pending','confirmed')
       RETURNING *, booking_date::text AS booking_date`,
      [id, user_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.json({ success: true, message: 'Booking cancelled', booking: result.rows[0] });
  } catch (err) {
    console.error('cancelBooking error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function getUserBookings(req, res) {
  try {
    const user_id = req.user.id;
    const result = await db.query(
      `SELECT b.*, b.booking_date::text AS booking_date, c.name as car_name, COALESCE(c.brand, c.make) AS brand
       FROM bookings b
       JOIN cars c ON b.car_id = c.id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [user_id]
    );
    res.json({ success: true, count: result.rows.length, bookings: result.rows });
  } catch (err) {
    console.error('getUserBookings error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
