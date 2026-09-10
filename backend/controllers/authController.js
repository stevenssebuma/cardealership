import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from backend/.env");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

export async function register(req, res) {
  try {
    const {
      name = "",
      email,
      password,
      phone = null,
    } = req.body || {};

    const normalizedEmail = normalizeEmail(email);
    const plainPassword = String(password || "").trim();

    if (!normalizedEmail || !plainPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (plainPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await pool.query(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    const result = await pool.query(
      `
        INSERT INTO users (
          name,
          email,
          password,
          role,
          phone
        )
        VALUES ($1, $2, $3, 'user', $4)
        RETURNING
          id,
          name,
          email,
          role,
          phone,
          created_at,
          updated_at
      `,
      [
        String(name || "").trim(),
        normalizedEmail,
        hashedPassword,
        phone ? String(phone).trim() : null,
      ]
    );

    const user = result.rows[0];
    const token = createToken(user);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    const normalizedEmail = normalizeEmail(email);
    const plainPassword = String(password || "");

    if (!normalizedEmail || !plainPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          email,
          password,
          role,
          phone,
          created_at,
          updated_at
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const databaseUser = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      plainPassword,
      databaseUser.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = publicUser(databaseUser);
    const token = createToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| GET CURRENT USER
|--------------------------------------------------------------------------
*/

export async function getCurrentUser(req, res) {
  try {
    const userId = req.user?.id || req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          email,
          role,
          phone,
          created_at,
          updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: publicUser(result.rows[0]),
    });
  } catch (error) {
    console.error("Get current user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get user",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE CURRENT USER
|--------------------------------------------------------------------------
*/

export async function updateCurrentUser(req, res) {
  try {
    const userId = req.user?.id || req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    const { name, email, phone } = req.body || {};

    if (
      name === undefined &&
      email === undefined &&
      phone === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required",
      });
    }

    const fields = [];
    const values = [];
    let parameterNumber = 1;

    if (name !== undefined) {
      fields.push(`name = $${parameterNumber++}`);
      values.push(String(name).trim());
    }

    if (email !== undefined) {
      fields.push(`email = $${parameterNumber++}`);
      values.push(normalizeEmail(email));
    }

    if (phone !== undefined) {
      fields.push(`phone = $${parameterNumber++}`);
      values.push(phone ? String(phone).trim() : null);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");

    values.push(userId);

    const result = await pool.query(
      `
        UPDATE users
        SET ${fields.join(", ")}
        WHERE id = $${parameterNumber}
        RETURNING
          id,
          name,
          email,
          role,
          phone,
          created_at,
          updated_at
      `,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: publicUser(result.rows[0]),
    });
  } catch (error) {
    console.error("Update user error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "That email address is already in use",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| CHANGE PASSWORD
|--------------------------------------------------------------------------
*/

export async function changeCurrentUserPassword(req, res) {
  try {
    const userId = req.user?.id || req.params.id;
    const { currentPassword, newPassword } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const result = await pool.query(
      `
        SELECT id, password
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      result.rows[0].password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query(
      `
        UPDATE users
        SET password = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [hashedPassword, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| DELETE CURRENT USER
|--------------------------------------------------------------------------
*/

export async function deleteCurrentUser(req, res) {
  try {
    const userId = req.user?.id || req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    const result = await pool.query(
      `
        DELETE FROM users
        WHERE id = $1
        RETURNING id
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User account deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
}
