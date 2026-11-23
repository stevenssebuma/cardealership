import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { adminMetricsController } from '../controllers/adminMetricsController.js';

const router = express.Router();
router.use(protect,adminOnly);
router.get('/',adminMetricsController.getMetrics);
router.get('/inventory',adminMetricsController.getInventoryMetrics);
router.get('/bookings',adminMetricsController.getBookingMetrics);
export default router;
