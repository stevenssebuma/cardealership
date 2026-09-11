import express from "express";
import {
  createSession,
  refreshSession,
  verifySession,
  listSessions,
  revokeSession,
  revokeAllSessions,
  logout,
} from "../controllers/sessionController.js";
import { authenticateToken, rateLimitProtectedRoute } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/sessions/create
 * Create a new session and return token
 */
router.post("/create", createSession);

/**
 * POST /api/sessions/refresh
 * Refresh an expiring token
 */
router.post("/refresh", refreshSession);

/**
 * GET /api/sessions/verify
 * Verify current session token
 */
router.get("/verify", verifySession);

/**
 * GET /api/sessions
 * List all active sessions for current user
 */
router.get("/", rateLimitProtectedRoute, authenticateToken, listSessions);

/**
 * DELETE /api/sessions/:sessionId
 * Revoke a specific session
 */
router.delete("/:sessionId", rateLimitProtectedRoute, authenticateToken, revokeSession);

/**
 * POST /api/sessions/revoke-all
 * Revoke all sessions except current
 */
router.post("/revoke-all", rateLimitProtectedRoute, authenticateToken, revokeAllSessions);

/**
 * POST /api/sessions/logout
 * Logout current session
 */
router.post("/logout", logout);

export default router;
