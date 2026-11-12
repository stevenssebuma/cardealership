import db from '../config/db.js';
import { BOOKING_TIME_SLOTS, BUSINESS_HOURS } from '../utils/validators.js';

const ACTIVE_BOOKING_STATUSES = ['cancelled', 'completed'];

export async function getAvailableSlots(carId, date) {
  const result = await db.query(
    `SELECT time_slot FROM bookings
     WHERE car_id = $1 AND booking_date = $2::date
       AND status NOT IN ('cancelled','completed')`,
    [carId, date]
  );
  const bookedSlots = result.rows.map(r => r.time_slot);
  const availableSlots = BOOKING_TIME_SLOTS.filter(s => !bookedSlots.includes(s));
  return { date, carId, totalSlots: BOOKING_TIME_SLOTS.length, bookedSlots, availableSlots };
}

/**
 * Returns whether a slot can still be booked. Pass a pool client to run the
 * check inside an existing transaction.
 */
export async function checkSlotAvailability(client, carId, date, timeSlot) {
  const queryable = client || db;
  const result = await queryable.query(
    `SELECT id, user_id, status FROM bookings
     WHERE car_id = $1 AND booking_date = $2::date AND time_slot = $3
       AND status NOT IN ('cancelled','completed')
     LIMIT 1`,
    [carId, date, timeSlot]
  );
  return { available: result.rows.length === 0, conflict: result.rows[0] || null };
}

export async function getWeeklyAvailability(carId, startDate) {
  const days = [];
  const start = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    if (BUSINESS_HOURS.days.includes(d.getDay())) {
      const a = await getAvailableSlots(carId, dateStr);
      days.push({ date: dateStr, dayName: d.toLocaleDateString('en-US', { weekday: 'long' }), ...a });
    } else {
      days.push({ date: dateStr, dayName: d.toLocaleDateString('en-US', { weekday: 'long' }), closed: true, availableSlots: [] });
    }
  }
  return days;
}

export async function checkUserBookingLimits(userId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM bookings
     WHERE user_id = $1 AND status IN ('pending','confirmed')
       AND booking_date >= CURRENT_DATE`,
    [userId]
  );
  const active = Number(result.rows[0]?.count ?? 0);
  const MAX = 3;
  return {
    allowed: active < MAX,
    currentCount: active,
    maxAllowed: MAX,
    message: active >= MAX ? `You already have ${active} active bookings. Max is ${MAX}.` : 'OK'
  };
}

export { ACTIVE_BOOKING_STATUSES };
