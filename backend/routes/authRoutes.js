import express from "express";
import authController from "../controllers/authController.js";
import {
  authenticateToken,
  isAdmin,
  rateLimitLogin,
} from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/register", authController.register.bind(authController));
router.post(
  "/login",
  rateLimitLogin,
  authController.login.bind(authController),
);
router.post("/logout", authController.logout.bind(authController));
router.get(
  "/me",
  authenticateToken,
  authController.getCurrentUser.bind(authController),
);
router.get(
  "/session",
  authenticateToken,
  authController.getCurrentUser.bind(authController),
);
router.post(
  "/refresh",
  authenticateToken,
  authController.refreshToken.bind(authController),
);
router.put(
  "/change-password",
  authenticateToken,
  authController.changePassword.bind(authController),
);
router.get(
  "/users",
  authenticateToken,
  isAdmin,
  authController.listUsers.bind(authController),
);
router.delete(
  "/users/:id",
  authenticateToken,
  isAdmin,
  authController.deleteUser.bind(authController),
);
export default router;
