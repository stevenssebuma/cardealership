import express from "express";
import {
  initiateTOTPSetup,
  verifyTOTPSetup,
  verifyMFALogin,
  getMFAStatus,
  disableMFA,
  getBackupCodesCount,
} from "../controllers/mfaController.js";
import { authenticateToken, rateLimitProtectedRoute } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/mfa/setup/totp
 * Initiate TOTP setup - returns QR code and secret
 */
router.post("/setup/totp", rateLimitProtectedRoute, authenticateToken, initiateTOTPSetup);

/**
 * POST /api/mfa/verify/totp
 * Verify TOTP code and complete setup
 */
router.post("/verify/totp", rateLimitProtectedRoute, authenticateToken, verifyTOTPSetup);

/**
 * POST /api/mfa/verify/login
 * Verify MFA during login (TOTP or backup code)
 */
router.post("/verify/login", verifyMFALogin);

/**
 * GET /api/mfa/status
 * Get current MFA status for user
 */
router.get("/status", rateLimitProtectedRoute, authenticateToken, getMFAStatus);

/**
 * POST /api/mfa/disable
 * Disable MFA for user account
 */
router.post("/disable", rateLimitProtectedRoute, authenticateToken, disableMFA);

/**
 * GET /api/mfa/backup-codes/count
 * Get count of unused backup codes
 */
router.get("/backup-codes/count", rateLimitProtectedRoute, authenticateToken, getBackupCodesCount);

export default router;
