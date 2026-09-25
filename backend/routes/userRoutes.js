// backend/routes/userRoutes.js
//
// Mounted at /api/users by server.js.
//
// NOTE: the previous revision of this file replaced these profile routes with
// an /api/auth/register + /api/auth/login copy. Authentication lives in
// routes/authRoutes.js (mounted at /api/auth); this router only exposes the
// authenticated customer profile endpoints used by the frontend profile page
// and settings panel.

import express from "express";

import {
  getCurrentUser,
  updateCurrentUser,
  changeCurrentUserPassword,
} from "../controllers/authController.js";

import {
  authenticateToken,
  rateLimitProtectedRoute,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * GET /api/users/me
 * Return the authenticated customer profile.
 */
router.get("/me", rateLimitProtectedRoute, authenticateToken, getCurrentUser);

/**
 * PATCH /api/users/me
 * Update the authenticated customer name, email and phone number.
 */
router.patch("/me", rateLimitProtectedRoute, authenticateToken, updateCurrentUser);

/**
 * PATCH /api/users/me/password
 * Change the authenticated customer password.
 */
router.patch(
  "/me/password",
  rateLimitProtectedRoute,
  authenticateToken,
  changeCurrentUserPassword
);

export default router;
