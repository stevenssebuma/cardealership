import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import reportController from '../controllers/reportController.js';

const router = express.Router();
router.use(protect, adminOnly);

// GET /api/admin/reports/inventory - Generate PDF inventory report
router.get(
    '/inventory',
    reportController.generateInventoryReport.bind(reportController)
);

// GET /api/admin/reports/inventory/json - Get inventory data as JSON
router.get(
    '/inventory/json',
    reportController.getInventoryJSON.bind(reportController)
);

// GET /api/admin/reports/inventory/summary - Get summary only (no download)
router.get(
    '/inventory/summary',
    reportController.getInventorySummary.bind(reportController)
);

export default router;
