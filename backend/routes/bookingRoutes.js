import express from 'express';

import {
  authenticateToken,
  rateLimitProtectedRoute,
} from '../middleware/authMiddleware.js';

import {
  createBooking,
  getAvailability,
  getMyBookings,
  getUserBookings,
  cancelBooking,
} from '../controllers/bookingController.js';

const router = express.Router();

// Create a test-drive booking for the signed-in customer (slot conflict check
// + confirmation email). The identity always comes from the bearer token.
router.post('/create', rateLimitProtectedRoute, authenticateToken, createBooking);

// Slots that can still be booked for a car on a date
router.get('/check-availability', getAvailability);

// Bookings belonging to the authenticated customer
router.get('/me', rateLimitProtectedRoute, authenticateToken, getMyBookings);

// Bookings for a specific user (only the owner, or an admin, may read them)
router.get(
  '/user/:user_id',
  rateLimitProtectedRoute,
  authenticateToken,
  getUserBookings,
);

// Cancel a booking (only the owner, or an admin, may cancel)
router.put(
  '/:id/cancel',
  rateLimitProtectedRoute,
  authenticateToken,
  cancelBooking,
);

export default router;
