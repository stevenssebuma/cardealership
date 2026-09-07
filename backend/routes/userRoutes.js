import express from "express";

import {
  updateCurrentUser,
  changeCurrentUserPassword,
} from "../controllers/authController.js";

import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * PATCH /api/users/me
 * Update name and email.
 */
router.patch("/me", authenticateToken, updateCurrentUser);

/**
 * PATCH /api/users/me/password
 * Change the authenticated user's password.
 */
router.patch(
  "/me/password",
  authenticateToken,
  changeCurrentUserPassword
);

export default router;