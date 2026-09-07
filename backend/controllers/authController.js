import bcrypt from "bcrypt";

import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserProfile,
  updateUserPassword,
} from "../models/userModel.js";

import { generateToken } from "../utils/jwt.js";

/*
|--------------------------------------------------------------------------
| REGISTER USER
|--------------------------------------------------------------------------
*/

export const register = async (req, res) => {
  try {
    const { name, email, password, role = "user" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    const allowedRoles = ["user", "admin"];

    const normalizedRole = allowedRoles.includes(role) ? role : "user";

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await createUser(
      name.trim(),
      normalizedEmail,
      hashedPassword,
      normalizedRole,
    );

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration failed:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed.",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| LOGIN USER
|--------------------------------------------------------------------------
*/

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed.",
      error: error.message,
    });
  }
};

/* 
|--------------------------------------------------------------------------
| UPDATE CURRENT USER PROFILE
|--------------------------------------------------------------------------
*/

export const updateCurrentUser = async (req, res) => {
  try {
    // The user ID comes from the verified JWT.
    // It does NOT come from the URL or request body.
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { name, email } = req.body;

    // Validate required fields
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      !name.trim() ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required.",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // Check whether another user already owns this email
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser && Number(existingUser.id) !== Number(userId)) {
      return res.status(409).json({
        success: false,
        message: "Email is already in use.",
      });
    }

    // Update the authenticated user's profile
    const updatedUser = await updateUserProfile(
      userId,
      normalizedName,
      normalizedEmail
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
    } catch (error) {
    console.error("Profile update failed:", error);

    // PostgreSQL unique constraint violation
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Email is already in use.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Profile update failed.",
    });
  }
};

/**
 * --------------------------------------------------------------------------
 * CHANGE CURRENT USER PASSWORD
 * --------------------------------------------------------------------------
 *
 * PATCH /api/users/me/password
 *
 * Requirements:
 * - User must be authenticated.
 * - User ID comes from req.user.id.
 * - Current password must be verified with bcrypt.compare().
 * - Incorrect current password returns 403.
 * - New password is hashed before storage.
 * - Plaintext passwords are never returned or logged.
 */
export const changeCurrentUserPassword = async (req, res) => {
  try {
    // The user ID MUST come from the verified JWT.
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { currentPassword, newPassword } = req.body || {};

    // Validate request
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    // Basic password validation
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long.",
      });
    }

    // Get the authenticated user from the database.
    const user = await findUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Verify the current password.
    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!passwordMatches) {
      return res.status(403).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Hash the new password before storing it.
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Store ONLY the hashed password.
    await updateUserPassword(userId, hashedPassword);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("Password update failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Password update failed.",
    });
  }
};