import pool from "../config/db.js";

export const createBookingsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      car_id INTEGER NOT NULL,
      booking_date DATE NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT unique_booking
        UNIQUE (car_id, booking_date, time_slot)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_car_date
      ON bookings(car_id, booking_date);

    CREATE INDEX IF NOT EXISTS idx_bookings_user
      ON bookings(user_id);

    CREATE INDEX IF NOT EXISTS idx_bookings_status
      ON bookings(status);
  `;

  try {
    await pool.query(query);
    console.log("Bookings table created successfully");
  } catch (error) {
    console.error("Error creating bookings table:", error);
    throw error;
  }
};

export default {
  createBookingsTable,
};
