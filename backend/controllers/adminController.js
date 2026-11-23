// backend/controllers/adminController.js
import db from '../config/db.js';
import { mapCarRow } from '../utils/databaseRows.js';
import { allowedBookingSources, validRecordId, validateAdminCarUpdate, canEditInventoryStatus } from '../utils/adminReviewPolicy.js';

const numericFields = (row, fields) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? Number(value ?? 0) : value])
);

// ============================================
// GET ADMIN STATS
// ============================================
export const getAdminStats = async (req, res) => {
  try {
    const carsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN lower(status)='available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN lower(status)='sold' THEN 1 ELSE 0 END) as sold,
        SUM(CASE WHEN lower(status)='pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN lower(status)='rejected' THEN 1 ELSE 0 END) as rejected,
        AVG(price) as avg_price
      FROM cars
    `);

    const usersResult = await db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role='user' THEN 1 ELSE 0 END) as regular,
        SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END) as new_this_week
      FROM users
    `);

    const bookingsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN booking_date >= date_trunc('month', CURRENT_DATE)::date THEN 1 ELSE 0 END) as this_month,
        SUM(CASE WHEN booking_date >= CURRENT_DATE - 7 THEN 1 ELSE 0 END) as this_week
      FROM bookings
    `);

    const pendingResult = await db.query(
      `SELECT COUNT(*) as pending_bookings FROM bookings WHERE status='pending'`
    );

    const pendingCarsResult = await db.query(
      `SELECT COUNT(*) as pending_cars FROM cars WHERE lower(status)='pending'`
    );

    const popularCarsResult = await db.query(`
      SELECT c.id, c.name, COALESCE(c.brand, c.make) AS brand, c.price,
             COUNT(b.id) as booking_count,
             SUM(CASE WHEN b.status='completed' THEN 1 ELSE 0 END) as completed_count
      FROM cars c
      LEFT JOIN bookings b ON c.id = b.car_id
      GROUP BY c.id
      ORDER BY booking_count DESC
      LIMIT 5
    `);

    const monthlyTrendResult = await db.query(`
      SELECT to_char(booking_date, 'YYYY-MM') as month, COUNT(*) as bookings
      FROM bookings
      WHERE booking_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY to_char(booking_date, 'YYYY-MM')
      ORDER BY month
    `);

    const dailyBookingsResult = await db.query(`
      SELECT booking_date::text as date, COUNT(*) as bookings
      FROM bookings
      WHERE booking_date >= CURRENT_DATE - 30
      GROUP BY booking_date
      ORDER BY booking_date
    `);

    const topUsersResult = await db.query(`
      SELECT u.id, u.name, u.email, COUNT(b.id) as booking_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      GROUP BY u.id, u.name, u.email
      ORDER BY booking_count DESC
      LIMIT 5
    `);

    const conversionResult = await db.query(`
      SELECT
        COUNT(DISTINCT user_id) as users_with_bookings,
        COUNT(*) as total_bookings,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
      FROM bookings
    `);

    const totalUsers = +usersResult.rows[0].total || 0;
    const usersWithBookings = +conversionResult.rows[0].users_with_bookings || 0;
    const totalBookings = +conversionResult.rows[0].total_bookings || 0;
    const completedBookings = +conversionResult.rows[0].completed || 0;

    const conversionRate = totalUsers > 0
      ? ((usersWithBookings / totalUsers) * 100).toFixed(2)
      : '0.00';

    const completionRate = totalBookings > 0
      ? ((completedBookings / totalBookings) * 100).toFixed(2)
      : '0.00';

    res.json({
      success: true,
      stats: {
        cars: {
          total: +carsResult.rows[0].total || 0,
          available: +carsResult.rows[0].available || 0,
          sold: +carsResult.rows[0].sold || 0,
          pending: +carsResult.rows[0].pending || 0,
          rejected: +carsResult.rows[0].rejected || 0,
          avgPrice: Math.round(+carsResult.rows[0].avg_price || 0)
        },
        users: {
          total: totalUsers,
          admins: +usersResult.rows[0].admins || 0,
          regular: +usersResult.rows[0].regular || 0,
          newThisWeek: +usersResult.rows[0].new_this_week || 0
        },
        bookings: {
          total: totalBookings,
          pending: +bookingsResult.rows[0].pending || 0,
          confirmed: +bookingsResult.rows[0].confirmed || 0,
          completed: completedBookings,
          cancelled: +bookingsResult.rows[0].cancelled || 0,
          thisMonth: +bookingsResult.rows[0].this_month || 0,
          thisWeek: +bookingsResult.rows[0].this_week || 0
        },
        pendingApprovals: {
          bookings: +pendingResult.rows[0].pending_bookings || 0,
          cars: +pendingCarsResult.rows[0].pending_cars || 0,
          total: (+pendingResult.rows[0].pending_bookings || 0) + (+pendingCarsResult.rows[0].pending_cars || 0)
        },
        metrics: {
          conversionRate: +conversionRate,
          completionRate: +completionRate,
          usersWithBookings,
          avgBookingsPerUser: totalUsers > 0
            ? +(totalBookings / totalUsers).toFixed(2)
            : 0
        },
        popularCars: popularCarsResult.rows.map(row => numericFields(mapCarRow(row), ['booking_count', 'completed_count'])),
        topUsers: topUsersResult.rows.map(row => numericFields(row, ['booking_count'])),
        monthlyTrend: monthlyTrendResult.rows.map(row => numericFields(row, ['bookings'])),
        dailyBookings: dailyBookingsResult.rows.map(row => numericFields(row, ['bookings'])),
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting admin stats:', error.code || 'ADMIN_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// EXPORT STATS AS CSV
// ============================================
export const exportStatsCSV = async (req, res) => {
  try {
    const bookings = await db.query(`
      SELECT b.id, u.name as user, u.email, c.name as car, COALESCE(c.brand,c.make) AS brand,
             b.booking_date::text AS booking_date, b.time_slot, b.status, b.created_at
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN cars c ON b.car_id = c.id
      ORDER BY b.created_at DESC
    `);

    const header = 'id,user,email,car,brand,booking_date,time_slot,status,created_at\n';
    const rows = bookings.rows.map(r =>
      [r.id, r.user, r.email, r.car, r.brand, r.booking_date, r.time_slot, r.status, r.created_at]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
    res.send(header + rows);
  } catch (error) {
    console.error('exportStatsCSV error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// GET BOOKINGS WITH FILTERS
// ============================================
export const getAllBookings = async (req, res) => {
  try {
    const { status, from, to, car_id, user_id, q } = req.query;
    const where = [];
    const params = [];

    const bind = (value) => { params.push(value); return `$${params.length}`; };
    if (status) where.push(`b.status = ${bind(status)}`);
    if (from) where.push(`b.booking_date >= ${bind(from)}`);
    if (to) where.push(`b.booking_date <= ${bind(to)}`);
    if (car_id) where.push(`b.car_id = ${bind(car_id)}`);
    if (user_id) where.push(`b.user_id = ${bind(user_id)}`);
    if (q) {
      const search = bind(`%${q}%`);
      where.push(`(u.name ILIKE ${search} OR u.email ILIKE ${search} OR c.name ILIKE ${search})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await db.query(`
      SELECT b.*, b.booking_date::text AS booking_date, u.name as user_name, u.email as user_email,
             c.name as car_name, COALESCE(c.brand,c.make) as car_brand
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN cars c ON b.car_id = c.id
      ${whereSql}
      ORDER BY b.created_at DESC
      LIMIT 200
    `, params);

    res.json({ success: true, count: result.rows.length, bookings: result.rows });
  } catch (error) {
    console.error('getAllBookings error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// GET PENDING APPROVALS
// ============================================
export const getPendingApprovals = async (req, res) => {
  try {
    const bookingsResult = await db.query(`
      SELECT b.*, b.booking_date::text AS booking_date, u.name as user_name, u.email as user_email,
             c.name as car_name, COALESCE(c.brand,c.make) as car_brand
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN cars c ON b.car_id = c.id
      WHERE b.status = 'pending'
      ORDER BY b.created_at ASC
    `);

    const carsResult = await db.query(`
      SELECT * FROM cars WHERE lower(status) = 'pending' ORDER BY created_at ASC
    `);

    res.json({
      success: true,
      pendingBookings: bookingsResult.rows,
      pendingCars: carsResult.rows.map(mapCarRow),
      totalPending: bookingsResult.rows.length + carsResult.rows.length
    });
  } catch (error) {
    console.error('getPendingApprovals error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// UPDATE BOOKING STATUS
// ============================================
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body?.status;
    const sources = allowedBookingSources(status);
    if (!validRecordId(id) || !sources) {
      return res.status(400).json({ success: false, message: 'Invalid booking ID or status' });
    }
    const result = await db.query(
      `UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = ANY($3::text[])
       RETURNING *, booking_date::text AS booking_date`,
      [status, Number(id), sources]
    );
    if (!result.rowCount) {
      const existing = await db.query('SELECT id FROM bookings WHERE id = $1', [Number(id)]);
      return res.status(existing.rowCount ? 409 : 404).json({
        success: false, message: existing.rowCount ? 'Invalid booking status transition' : 'Booking not found'
      });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'This time slot is already booked' });
    console.error('updateBookingStatus error:', error.code || 'ADMIN_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// BULK UPDATE BOOKINGS
// ============================================
export const bulkUpdateBookings = async (req, res) => {
  try {
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 ||
        ids.some(id => !validRecordId(id)) || new Set(ids.map(Number)).size !== ids.length) {
      return res.status(400).json({ success: false, message: 'Invalid booking IDs' });
    }
    const sources = allowedBookingSources(status);
    if (!sources) return res.status(400).json({ success: false, message: 'Invalid status' });
    const uniqueIds = ids.map(Number);
    const updatedIds = await db.withTransaction(async tx => {
      // Lock before validating; no partial status transitions can commit.
      const locked = await tx.query(
        'SELECT id, status FROM bookings WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
        [uniqueIds]
      );
      if (locked.rowCount !== uniqueIds.length || locked.rows.some(row => !sources.includes(row.status))) return null;
      const updated = await tx.query(
        `UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($2::int[]) AND status = ANY($3::text[]) RETURNING id`,
        [status, uniqueIds, sources]
      );
      if (updated.rowCount !== uniqueIds.length) throw Object.assign(new Error('Bulk booking conflict'), { code: 'BULK_STATUS_CONFLICT' });
      return updated.rows.map(row => row.id);
    });
    if (updatedIds === null) return res.status(409).json({ success: false, message: 'One or more bookings are missing or cannot transition; no bookings updated' });
    res.json({ success: true, updatedIds });
  } catch (error) {
    if (error.code === '23505' || error.code === 'BULK_STATUS_CONFLICT') {
      return res.status(409).json({ success: false, message: 'Booking status transition conflict' });
    }
    console.error('bulkUpdateBookings error:', error.code || 'ADMIN_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// APPROVE CAR
// ============================================
export const approveCar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validRecordId(id)) return res.status(400).json({ success: false, message: 'Invalid car ID' });
    const result = await db.query(
      `UPDATE cars SET status = 'available', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND lower(status) = 'pending' RETURNING *`, [Number(id)]
    );
    if (!result.rowCount) {
      const existing = await db.query('SELECT id FROM cars WHERE id = $1', [Number(id)]);
      return res.status(existing.rowCount ? 409 : 404).json({ success: false, message: existing.rowCount ? 'Only pending cars can be approved' : 'Car not found' });
    }
    res.json({ success: true, car: mapCarRow(result.rows[0]) });
  } catch (error) {
    console.error('approveCar error:', error.code || 'ADMIN_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// REJECT CAR
// ============================================
export const rejectCar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validRecordId(id)) return res.status(400).json({ success: false, message: 'Invalid car ID' });
    const result = await db.query(
      `UPDATE cars SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND lower(status) = 'pending' RETURNING *`, [Number(id)]
    );
    if (!result.rowCount) {
      const existing = await db.query('SELECT id FROM cars WHERE id = $1', [Number(id)]);
      return res.status(existing.rowCount ? 409 : 404).json({ success: false, message: existing.rowCount ? 'Only pending cars can be rejected' : 'Car not found' });
    }
    res.json({ success: true, car: mapCarRow(result.rows[0]) });
  } catch (error) {
    console.error('rejectCar error:', error.code || 'ADMIN_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// UPDATE CAR
// ============================================
export const updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validateAdminCarUpdate(req.body);
    if (!validRecordId(id) || errors.length) {
      return res.status(400).json({ success: false, message: 'Invalid vehicle update', errors });
    }
    const { name, brand, price, year, status, description, image_url } = req.body;
    const outcome = await db.withTransaction(async tx => {
      const current = await tx.query('SELECT id, status FROM cars WHERE id = $1 FOR UPDATE', [Number(id)]);
      if (!current.rowCount) return { statusCode: 404, message: 'Car not found' };
      if (status !== undefined && !canEditInventoryStatus(current.rows[0].status, status)) {
        return { statusCode: 409, message: 'Invalid vehicle status transition' };
      }
      const updated = await tx.query(
        `UPDATE cars
         SET name = COALESCE($1,name), brand = COALESCE($2,brand,make), make = COALESCE($2,make,brand),
             price = COALESCE($3,price), year = COALESCE($4,year), status = COALESCE($5,status),
             description = COALESCE($6,description), image_url = COALESCE($7,image_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8 RETURNING *`,
        [name, brand, price, year, status, description, image_url, Number(id)]
      );
      return { statusCode: 200, car: mapCarRow(updated.rows[0]) };
    });
    if (outcome.statusCode !== 200) return res.status(outcome.statusCode).json({ success: false, message: outcome.message });
    res.json({ success: true, car: outcome.car });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Vehicle already exists' });
    console.error('updateCar error:', error.code || 'ADMIN_FAILURE');
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ============================================
// DELETE CAR
// ============================================
export const deleteCar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM cars WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }
    res.json({ success: true, car: mapCarRow(result.rows[0]) });
  } catch (error) {
    if (['23001', '23503'].includes(error.code)) return res.status(409).json({ success: false, message: 'Car has dependent records' });
    console.error('deleteCar error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
