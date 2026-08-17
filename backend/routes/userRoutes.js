import express from "express";

import { updateCurrentUser } from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| UPDATE CURRENT USER PROFILE
|--------------------------------------------------------------------------
|
| PATCH /api/users/me
|
| The user ID comes from the verified JWT.
|
*/

router.patch("/me", authenticateToken, updateCurrentUser);

export default router;