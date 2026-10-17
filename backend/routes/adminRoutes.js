import express from "express";
import db from "../config/db.js";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware.js";
import {
  listAdminBookings,
  updateBookingStatus,
} from "../controllers/bookingController.js";
import { listUsers } from "../models/userRepository.js";

const router = express.Router();
router.use(authenticateToken, isAdmin);

router.get("/stats", async (_req, res) => {
  try {
    const [cars, users, bookingCounts, average] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS count FROM cars`),
      db.query(`SELECT COUNT(*)::int AS count FROM users`),
      db.query(
        `SELECT COUNT(*)::int AS active_count, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS recent_count FROM test_drives WHERE status <> 'cancelled'`,
      ),
      db.query(
        `SELECT COALESCE(ROUND(AVG(price)), 0)::int AS amount FROM cars`,
      ),
    ]);
    return res.json({
      success: true,
      stats: {
        totalRevenue: null,
        totalSales: null,
        salesMetricsAvailable: false,
        totalBookings: bookingCounts.rows[0].active_count,
        inventoryCount: cars.rows[0].count,
        averageCarPrice: average.rows[0].amount,
        totalUsers: users.rows[0].count,
        recentBookings: bookingCounts.rows[0].recent_count,
        currency: "UGX",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Unable to load admin statistics." });
  }
});
router.get("/stats/summary", async (_req, res) => {
  const [cars, bookings] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS count FROM cars`),
    db.query(
      `SELECT COUNT(*)::int AS count FROM test_drives WHERE status <> 'cancelled'`,
    ),
  ]);
  return res.json({
    success: true,
    summary: {
      totalRevenue: null,
      mtdRevenue: null,
      salesMetricsAvailable: false,
      totalBookings: bookings.rows[0].count,
      inventoryCount: cars.rows[0].count,
      growth: null,
      growthLabel: "Unavailable",
      currency: "UGX",
    },
    timestamp: new Date().toISOString(),
  });
});
router.get("/users", async (_req, res) => {
  const users = await listUsers();
  return res.json({ success: true, data: users, total: users.length });
});
router.get("/bookings", listAdminBookings);
router.put("/bookings/:id/status", updateBookingStatus);
router.get("/cars", async (_req, res) => {
  const result = await db.query(`SELECT * FROM cars ORDER BY created_at DESC`);
  return res.json({ success: true, data: result.rows, total: result.rowCount });
});
export default router;
