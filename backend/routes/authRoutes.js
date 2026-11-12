import express from "express";

import { register, login, getSession } from "../controllers/authController.js";
import { authenticateToken, rateLimitProtectedRoute } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.get("/session", rateLimitProtectedRoute, authenticateToken, getSession);
export default router;

