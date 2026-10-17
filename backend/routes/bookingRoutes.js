import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
  cancelBooking,
  checkAvailability,
  createBooking,
  getBookingsForUser,
  getMyBookings,
} from "../controllers/bookingController.js";

const router = express.Router();
router.get("/check-availability", checkAvailability);
router.post("/create", authenticateToken, createBooking);
router.post("/", authenticateToken, createBooking);
router.get("/me", authenticateToken, getMyBookings);
router.get("/user/:user_id", authenticateToken, getBookingsForUser);
router.put("/:id/cancel", authenticateToken, cancelBooking);
export default router;
