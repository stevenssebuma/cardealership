import bcrypt from "bcryptjs";
import {
  createUser,
  deleteUser,
  findUserByEmail,
  findUserById,
  listUsers,
  updateUserPassword,
} from "../models/userRepository.js";
import { generateToken } from "../middleware/authMiddleware.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const withoutPassword = ({ password, ...user }) => user;

function tokenFor(user) {
  return generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
}

export const authController = {
  async register(req, res) {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password)
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
          required: ["name", "email", "password"],
        });
      if (!emailPattern.test(email))
        return res
          .status(400)
          .json({ success: false, error: "Invalid email format" });
      if (String(password).length < 6)
        return res.status(400).json({
          success: false,
          error: "Password must be at least 6 characters long",
        });
      if (await findUserByEmail(email))
        return res.status(409).json({
          success: false,
          error: "User with this email already exists",
        });

      // Public registration must never grant administrative privileges.
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await createUser({
        name,
        email,
        password: passwordHash,
        role: "customer",
      });
      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: { user, token: tokenFor(user) },
      });
    } catch (error) {
      console.error("Registration error:", error);
      return res
        .status(500)
        .json({ success: false, error: "Registration failed" });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password)
        return res
          .status(400)
          .json({ success: false, error: "Email and password are required" });
      const user = await findUserByEmail(email);
      if (!user || !(await bcrypt.compare(password, user.password)))
        return res
          .status(401)
          .json({ success: false, error: "Invalid email or password" });
      return res.json({
        success: true,
        message: "Login successful",
        data: { user: withoutPassword(user), token: tokenFor(user) },
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ success: false, error: "Login failed" });
    }
  },

  async getCurrentUser(req, res) {
    const user = await findUserById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    return res.json({ success: true, data: withoutPassword(user) });
  },
  async logout(_req, res) {
    return res.json({ success: true, message: "Logged out successfully" });
  },
  async refreshToken(req, res) {
    const user = await findUserById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    return res.json({ success: true, data: { token: tokenFor(user) } });
  },
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    if (String(newPassword).length < 6)
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
    const user = await findUserById(req.user.id);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    if (!(await bcrypt.compare(currentPassword, user.password)))
      return res
        .status(401)
        .json({ success: false, error: "Current password is incorrect" });
    await updateUserPassword(user.id, await bcrypt.hash(newPassword, 10));
    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  },
  async listUsers(_req, res) {
    const users = await listUsers();
    return res.json({ success: true, data: users, total: users.length });
  },
  async deleteUser(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    if (id === req.user.id)
      return res.status(422).json({
        success: false,
        error: "Administrators cannot delete their own account",
      });
    const deleted = await deleteUser(id);
    if (!deleted)
      return res.status(404).json({ success: false, error: "User not found" });
    return res.json({ success: true, message: "User deleted successfully" });
  },
};

export default authController;
