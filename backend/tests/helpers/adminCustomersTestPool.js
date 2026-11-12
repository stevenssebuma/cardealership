// backend/tests/helpers/adminCustomersTestPool.js
//
// Stateful stand-in for the `users` and `bookings` queries behind the admin
// customer directory and the per-customer history drawer. Kept separate from
// bookingTestPool.js so the booking suites are unaffected by these shapes.

export function createAdminCustomersTestPool() {
  const users = [];
  const bookings = [];
  let nextBookingId = 1;

  function seedUser({
    id,
    name = null,
    email,
    role = "user",
    phone = null,
    created_at = new Date().toISOString(),
  }) {
    const user = { id: Number(id), name, email, role, phone, created_at };
    users.push(user);
    return user;
  }

  function seedBooking({
    user_id,
    car_model = "Test Vehicle",
    date,
    time_slot = "10:00",
    status = "confirmed",
    notes = null,
  }) {
    const booking = {
      id: nextBookingId,
      user_id: Number(user_id),
      car_id: 1,
      booking_date: String(date).slice(0, 10),
      time_slot,
      status,
      notes,
      created_at: new Date().toISOString(),
      updated_at: null,
      car_model,
    };

    nextBookingId += 1;
    bookings.push(booking);

    return booking;
  }

  const findUser = (id) => users.find((user) => user.id === Number(id));

  const query = async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, " ").trim();
    const args = Array.isArray(params) ? params : [];

    // Directory with booking counts.
    if (/FROM users u LEFT JOIN bookings b/i.test(text)) {
      const rows = users
        .map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          created_at: user.created_at,
          updated_at: user.created_at,
          booking_count: bookings.filter((booking) => booking.user_id === user.id)
            .length,
        }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      return { rows, rowCount: rows.length };
    }

    // Single customer lookup before building the history.
    if (/^SELECT id, name, email, role, phone, created_at FROM users WHERE id = \$1/i.test(text)) {
      const user = findUser(args[0]);
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
    }

    // One customer's complete history, cancelled bookings included.
    if (/FROM bookings b/i.test(text) && /WHERE b\.user_id = \$1/i.test(text)) {
      const rows = bookings
        .filter((booking) => booking.user_id === Number(args[0]))
        .sort(
          (a, b) =>
            b.booking_date.localeCompare(a.booking_date) || b.id - a.id,
        )
        .map((booking) => {
          const user = findUser(booking.user_id);

          return {
            ...booking,
            booking_date_text: booking.booking_date,
            car_model: booking.car_model,
            user_name: user?.name ?? null,
            user_email: user?.email ?? null,
          };
        });

      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  };

  return { query, users, bookings, seedUser, seedBooking };
}
