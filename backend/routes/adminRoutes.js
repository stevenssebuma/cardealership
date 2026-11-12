import express from 'express';

import { authenticateToken, checkRole, rateLimitProtectedRoute } from '../middleware/authMiddleware.js';
import pool from '../config/db.js';

const router = express.Router();

// Every admin endpoint requires a rate limit, a valid token and the admin role.
const adminGuard = [rateLimitProtectedRoute, authenticateToken, checkRole(['admin'])];

const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

const toNumber = (value) => (value === null || value === undefined ? 0 : Number(value));

function sendServerError(res, label, error) {
    console.error(`${label}:`, error.message);

    return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
    });
}

// ============================================
// GET /api/admin/stats - Full dashboard metrics
// ============================================

router.get('/stats', ...adminGuard, async (req, res) => {
    try {
        const [carStats, userStats, bookingStats, popularCars, monthlyTrend] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'Available')::int AS available,
                    COUNT(*) FILTER (WHERE status = 'Reserved')::int AS reserved,
                    COUNT(*) FILTER (WHERE status = 'Sold')::int AS sold,
                    COALESCE(ROUND(AVG(price)), 0)::bigint AS average_price
                FROM cars
            `),
            pool.query(`SELECT COUNT(*)::int AS total FROM users`),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS total,
                    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                    COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
                    COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                    COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
                FROM bookings
            `),
            pool.query(`
                SELECT
                    c.id,
                    c.name,
                    c.make,
                    c.price,
                    COUNT(b.id)::int AS booking_count
                FROM cars c
                JOIN bookings b ON b.car_id = c.id AND b.status <> 'cancelled'
                GROUP BY c.id, c.name, c.make, c.price
                ORDER BY booking_count DESC, c.name ASC
                LIMIT 5
            `),
            pool.query(`
                SELECT
                    TO_CHAR(months.month, 'Mon') AS month,
                    COUNT(b.id)::int AS bookings
                FROM generate_series(
                    date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                    date_trunc('month', CURRENT_DATE),
                    INTERVAL '1 month'
                ) AS months(month)
                LEFT JOIN bookings b
                    ON date_trunc('month', b.created_at) = months.month
                    AND b.status <> 'cancelled'
                GROUP BY months.month
                ORDER BY months.month
            `)
        ]);

        // COUNT queries always return one row; default defensively so a driver
        // that returns nothing can never turn the dashboard into a 500.
        const cars = carStats.rows[0] ?? {};
        const users = userStats.rows[0] ?? {};
        const bookings = bookingStats.rows[0] ?? {};

        return res.json({
            success: true,
            stats: {
                cars: {
                    total: toNumber(cars.total),
                    available: toNumber(cars.available),
                    reserved: toNumber(cars.reserved),
                    sold: toNumber(cars.sold),
                    averagePrice: toNumber(cars.average_price)
                },
                users: {
                    total: toNumber(users.total)
                },
                bookings: {
                    total: toNumber(bookings.total),
                    pending: toNumber(bookings.pending),
                    confirmed: toNumber(bookings.confirmed),
                    completed: toNumber(bookings.completed),
                    cancelled: toNumber(bookings.cancelled)
                },
                // There is no payments or sales table in this schema, so revenue
                // is reported as unavailable instead of being invented.
                revenue: {
                    monthly: null,
                    total: null,
                    currency: 'UGX',
                    available: false
                },
                popularCars: popularCars.rows.map((car) => ({
                    id: car.id,
                    name: car.name,
                    make: car.make,
                    price: toNumber(car.price),
                    bookingCount: car.booking_count
                })),
                monthlyTrend: monthlyTrend.rows.map((row) => ({
                    month: row.month,
                    bookings: row.bookings
                }))
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return sendServerError(res, 'Admin stats error', error);
    }
});

// ============================================
// GET /api/admin/stats/summary - Quick summary
// ============================================

router.get('/stats/summary', ...adminGuard, async (req, res) => {
    try {
        const [carCount, bookingCounts, mtdCount, previousMonthCount] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total FROM cars`),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS total,
                    COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
                FROM bookings
            `),
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM bookings
                WHERE status <> 'cancelled'
                  AND created_at >= date_trunc('month', CURRENT_DATE)
            `),
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM bookings
                WHERE status <> 'cancelled'
                  AND created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                  AND created_at < date_trunc('month', CURRENT_DATE)
            `)
        ]);

        const monthToDate = toNumber(mtdCount.rows[0]?.total);
        const previousMonth = toNumber(previousMonthCount.rows[0]?.total);
        const growth = previousMonth > 0
            ? Number((((monthToDate - previousMonth) / previousMonth) * 100).toFixed(1))
            : 0;

        return res.json({
            success: true,
            summary: {
                inventoryCount: toNumber(carCount.rows[0]?.total),
                totalBookings: toNumber(bookingCounts.rows[0]?.total),
                pendingBookings: toNumber(bookingCounts.rows[0]?.pending),
                bookingsThisMonth: monthToDate,
                bookingsLastMonth: previousMonth,
                growth,
                growthLabel: growth >= 0 ? 'Up' : 'Down'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return sendServerError(res, 'Admin summary error', error);
    }
});

// ============================================
// GET /api/admin/users
// ============================================

router.get('/users', ...adminGuard, async (req, res) => {
    try {
        // The password hash is never selected.
        const result = await pool.query(`
            SELECT id, name, email, role, phone, created_at, updated_at
            FROM users
            ORDER BY created_at DESC
        `);

        return res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        return sendServerError(res, 'Admin users error', error);
    }
});

// ============================================
// GET /api/admin/bookings
// ============================================

router.get('/bookings', ...adminGuard, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                b.id,
                b.status,
                b.booking_date,
                b.time_slot,
                b.notes,
                b.created_at,
                u.name AS user_name,
                u.email AS user_email,
                c.name AS car_name,
                c.make AS car_make
            FROM bookings b
            LEFT JOIN users u ON u.id = b.user_id
            LEFT JOIN cars c ON c.id = b.car_id
            ORDER BY b.created_at DESC
        `);

        return res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        return sendServerError(res, 'Admin bookings error', error);
    }
});

// ============================================
// GET /api/admin/cars
// ============================================

router.get('/cars', ...adminGuard, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                c.*,
                cs.power,
                cs.engine,
                cs.drive,
                (
                    SELECT ci.image_url
                    FROM car_images ci
                    WHERE ci.car_id = c.id AND ci.image_type = 'primary'
                    ORDER BY ci.id ASC
                    LIMIT 1
                ) AS primary_image
            FROM cars c
            LEFT JOIN car_specs cs ON cs.car_id = c.id
            ORDER BY c.created_at DESC
        `);

        return res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        return sendServerError(res, 'Admin cars error', error);
    }
});

// ============================================
// GET /api/admin/pending-approvals
// ============================================

router.get('/pending-approvals', ...adminGuard, async (req, res) => {
    try {
        const [pendingBookings, reservedCars] = await Promise.all([
            pool.query(`
                SELECT
                    b.id,
                    b.booking_date,
                    b.time_slot,
                    b.created_at,
                    u.name AS user_name,
                    u.email AS user_email,
                    c.name AS car_name,
                    c.make AS car_make
                FROM bookings b
                LEFT JOIN users u ON u.id = b.user_id
                LEFT JOIN cars c ON c.id = b.car_id
                WHERE b.status = 'pending'
                ORDER BY b.created_at ASC
            `),
            pool.query(`
                SELECT id, name, make, price, status
                FROM cars
                WHERE status = 'Reserved'
                ORDER BY created_at ASC
            `)
        ]);

        return res.json({
            success: true,
            totalPending: pendingBookings.rows.length,
            pendingBookings: pendingBookings.rows,
            pendingCars: reservedCars.rows.map((car) => ({
                ...car,
                price: toNumber(car.price)
            })),
            totalReservedCars: reservedCars.rows.length
        });
    } catch (error) {
        return sendServerError(res, 'Admin pending approvals error', error);
    }
});

// ============================================
// PUT /api/admin/bookings/:id/status
// ============================================

router.put('/bookings/:id/status', ...adminGuard, async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        const { status } = req.body || {};

        if (!Number.isInteger(bookingId) || bookingId <= 0) {
            return res.status(400).json({ success: false, message: 'A valid booking id is required.' });
        }

        if (!BOOKING_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${BOOKING_STATUSES.join(', ')}.`
            });
        }

        const result = await pool.query(
            `UPDATE bookings
             SET status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, status, booking_date, time_slot`,
            [status, bookingId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        return res.json({
            success: true,
            message: 'Booking status updated.',
            booking: result.rows[0]
        });
    } catch (error) {
        return sendServerError(res, 'Admin booking status error', error);
    }
});

// ============================================
// PUT /api/admin/cars/:id/approve
// ============================================

router.put('/cars/:id/approve', ...adminGuard, async (req, res) => {
    try {
        const carId = Number(req.params.id);

        if (!Number.isInteger(carId) || carId <= 0) {
            return res.status(400).json({ success: false, message: 'A valid car id is required.' });
        }

        // Approving a reserved listing publishes it back to the public inventory.
        const result = await pool.query(
            `UPDATE cars
             SET status = 'Available', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, name, status`,
            [carId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehicle not found.' });
        }

        return res.json({
            success: true,
            message: 'Vehicle approved.',
            car: result.rows[0]
        });
    } catch (error) {
        return sendServerError(res, 'Admin car approval error', error);
    }
});

export default router;
