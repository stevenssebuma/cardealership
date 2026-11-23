import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import highValueController from '../controllers/highValueController.js';

const router = express.Router();
router.use(protect, adminOnly);

// GET /api/admin/spotlight/alerts - Get all alerts
router.get(
    '/alerts',
    highValueController.getAlerts.bind(highValueController)
);

// PUT /api/admin/spotlight/alerts/:alertId/read - Mark alert as read
router.put(
    '/alerts/:alertId/read',
    highValueController.markAlertRead.bind(highValueController)
);

// GET /api/admin/spotlight/featured - Get featured vehicles
router.get(
    '/featured',
    highValueController.getFeaturedVehicles.bind(highValueController)
);

// GET /api/admin/spotlight/stats - Get high-value stats
router.get(
    '/stats',
    highValueController.getHighValueStats.bind(highValueController)
);

// POST /api/admin/spotlight/process-all - Process all vehicles
router.post(
    '/process-all',
    highValueController.processAllVehicles.bind(highValueController)
);

// POST /api/admin/spotlight/process/:vehicleId - Process specific vehicle
router.post(
    '/process/:vehicleId',
    highValueController.processVehicle.bind(highValueController)
);

// POST /api/webhooks/vehicle-created - Authenticated webhook for new vehicle creation
router.post(
    '/webhooks/vehicle-created',
    highValueController.vehicleCreatedWebhook.bind(highValueController)
);

export default router;
