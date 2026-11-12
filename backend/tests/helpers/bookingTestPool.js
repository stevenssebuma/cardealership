// backend/tests/helpers/bookingTestPool.js
//
// A tiny stateful stand-in for the PostgreSQL pool, scoped to the `bookings`
// table queries used by the booking routes and the reminder job. It keeps the
// integration suites deterministic while the real routes talk SQL.

const ACTIVE_EXCLUDED_STATUSES = ["cancelled", "completed"];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createBookingTestPool() {
  const bookings = [];
  let nextId = 1;

  function normalize(seed) {
    const bookingDate =
      seed.booking_date ??
      seed.date ??
      todayString();

    return {
      id: seed.id ?? nextId++,
      user_id: Number(seed.user_id ?? seed.userId ?? 0),
      car_id: Number(seed.car_id ?? seed.carId ?? 0),
      booking_date: String(bookingDate).slice(0, 10),
      time_slot: seed.time_slot ?? seed.timeSlot ?? null,
      status: seed.status ?? "confirmed",
      notes: seed.notes ?? null,
      reminder_sent_at: seed.reminder_sent_at ?? (seed.reminderSent ? new Date().toISOString() : null),
      created_at: seed.created_at ?? new Date().toISOString(),
      updated_at: seed.updated_at ?? null,
      car_model: seed.car_model ?? seed.carModel ?? "Test Vehicle",
      user_name: seed.user_name ?? seed.name ?? null,
      user_email: seed.user_email ?? seed.email ?? null,
    };
  }

  const isActive = (booking) => !ACTIVE_EXCLUDED_STATUSES.includes(booking.status);

  // Shape returned by the controller's BOOKING_SELECT query.
  const toSelectRow = (booking) => ({
    ...booking,
    booking_date_text: booking.booking_date,
  });

  // Shape returned by the reminder job's scan query.
  const toReminderRow = (booking) => ({
    id: booking.id,
    status: booking.status,
    booking_date: booking.booking_date,
    time_slot: booking.time_slot,
    reminder_sent_at: booking.reminder_sent_at,
    user_name: booking.user_name,
    user_email: booking.user_email,
    car_model: booking.car_model,
  });

  const query = async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    const args = toArray(params);

    // Vehicle lookup before insert
    if (/^SELECT id, name FROM cars/i.test(text)) {
      return { rows: [{ id: Number(args[0]), name: "Test Vehicle" }], rowCount: 1 };
    }

    // Reminder job scan
    if (/FROM bookings b/i.test(text) && /b\.status = 'confirmed'/i.test(text)) {
      const rows = bookings.filter((booking) => booking.status === "confirmed");
      return { rows: rows.map(toReminderRow), rowCount: rows.length };
    }

    // Booking list for one user (cancelled included or excluded)
    if (/FROM bookings b/i.test(text) && /WHERE b\.user_id = \$1/i.test(text)) {
      const excludeCancelled = /b\.status <> 'cancelled'/i.test(text);
      const rows = bookings.filter(
        (booking) =>
          booking.user_id === Number(args[0]) &&
          (!excludeCancelled || booking.status !== "cancelled"),
      );
      return { rows: rows.map(toSelectRow), rowCount: rows.length };
    }

    // Single booking after a status change
    if (/FROM bookings b/i.test(text) && /WHERE b\.id = \$1/i.test(text)) {
      const row = bookings.find((booking) => booking.id === Number(args[0]));
      return { rows: row ? [toSelectRow(row)] : [], rowCount: row ? 1 : 0 };
    }

    // Existing booking owner and status (cancel guard)
    if (/SELECT id, (user_id, )?status FROM bookings/i.test(text)) {
      const row = bookings.find((booking) => booking.id === Number(args[0]));
      return {
        rows: row ? [{ id: row.id, user_id: row.user_id, status: row.status }] : [],
        rowCount: row ? 1 : 0,
      };
    }

    // Slot conflict check
    if (/SELECT id FROM bookings/i.test(text)) {
      const row = bookings.find(
        (booking) =>
          booking.car_id === Number(args[0]) &&
          booking.booking_date === args[1] &&
          booking.time_slot === args[2] &&
          isActive(booking),
      );
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }

    // Active booking limit
    if (/COUNT\(\*\)::int AS count FROM bookings/i.test(text)) {
      const active = bookings.filter(
        (booking) =>
          booking.user_id === Number(args[0]) &&
          ["pending", "confirmed"].includes(booking.status) &&
          booking.booking_date >= todayString(),
      );
      return { rows: [{ count: active.length }], rowCount: 1 };
    }

    // Booked slots for a car/date
    if (/SELECT time_slot FROM bookings/i.test(text)) {
      const rows = bookings.filter(
        (booking) =>
          booking.car_id === Number(args[0]) &&
          booking.booking_date === args[1] &&
          isActive(booking),
      );
      return { rows: rows.map((booking) => ({ time_slot: booking.time_slot })), rowCount: rows.length };
    }

    if (/INSERT INTO bookings/i.test(text)) {
      const booking = normalize({
        user_id: args[0],
        car_id: args[1],
        booking_date: args[2],
        time_slot: args[3],
        notes: args[4] ?? null,
        status: "confirmed",
      });
      bookings.push(booking);
      return { rows: [{ id: booking.id, created_at: booking.created_at }], rowCount: 1 };
    }

    if (/UPDATE bookings SET reminder_sent_at/i.test(text)) {
      const booking = bookings.find((entry) => entry.id === Number(args[1]));
      if (booking) booking.reminder_sent_at = args[0];
      return { rows: booking ? [booking] : [], rowCount: booking ? 1 : 0 };
    }

    if (/UPDATE bookings SET status = 'cancelled'/i.test(text)) {
      const booking = bookings.find((entry) => entry.id === Number(args[0]));
      if (booking) booking.status = "cancelled";
      return { rows: booking ? [booking] : [], rowCount: booking ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  };

  return {
    query,
    bookings,
    seedBooking(seed) {
      const booking = normalize(seed);
      bookings.push(booking);
      return booking;
    },
    reset() {
      bookings.length = 0;
      nextId = 1;
    },
  };
}
