// backend/seedBookings.js
//
// Seeds a handful of demo test-drive bookings so the admin dashboard has data to
// aggregate. Skips itself when bookings already exist, so it is safe to re-run.
//
// Usage: cd backend && npm run seed:bookings

import pool, { initializeDatabase } from "./config/db.js";

// `monthsAgo` spreads created_at backwards so the 6-month trend is not flat.
const DEMO_BOOKINGS = [
  { carOffset: 0, daysFromNow: 3, slot: "10:00", status: "pending", monthsAgo: 0 },
  { carOffset: 1, daysFromNow: 5, slot: "14:00", status: "pending", monthsAgo: 0 },
  { carOffset: 2, daysFromNow: 2, slot: "11:00", status: "confirmed", monthsAgo: 0 },
  { carOffset: 3, daysFromNow: -12, slot: "09:00", status: "completed", monthsAgo: 1 },
  { carOffset: 4, daysFromNow: -45, slot: "16:00", status: "completed", monthsAgo: 2 },
  { carOffset: 0, daysFromNow: -70, slot: "13:00", status: "cancelled", monthsAgo: 3 },
  { carOffset: 5, daysFromNow: -100, slot: "15:00", status: "completed", monthsAgo: 4 },
];

async function seedBookings() {
  await initializeDatabase();

  const existing = await pool.query("SELECT COUNT(*)::int AS count FROM bookings");

  if (existing.rows[0].count > 0) {
    console.log(`Bookings already contains ${existing.rows[0].count} rows. Nothing to seed.`);
    return;
  }

  const users = await pool.query("SELECT id FROM users ORDER BY id LIMIT 1");

  if (users.rows.length === 0) {
    console.log("No users found. Run `node reset-admin.js` first.");
    return;
  }

  const cars = await pool.query("SELECT id FROM cars ORDER BY id");

  if (cars.rows.length === 0) {
    console.log("No vehicles found. Run `npm run seed:inventory` first.");
    return;
  }

  const userId = users.rows[0].id;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const booking of DEMO_BOOKINGS) {
      const car = cars.rows[booking.carOffset % cars.rows.length];

      await client.query(
        `
          INSERT INTO bookings (
            user_id, car_id, booking_date, time_slot, notes, status, created_at
          )
          VALUES (
            $1, $2, CURRENT_DATE + ($3 || ' days')::interval, $4, $5, $6,
            CURRENT_TIMESTAMP - ($7 || ' months')::interval
          );
        `,
        [
          userId,
          car.id,
          String(booking.daysFromNow),
          booking.slot,
          "Demo booking seeded for the local admin dashboard.",
          booking.status,
          String(booking.monthsAgo),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${DEMO_BOOKINGS.length} demo bookings.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seedBookings()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Booking seed failed:", error.message);
    await pool.end();
    process.exitCode = 1;
  });
