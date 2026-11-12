import { SessionManager } from "../services/sessionManager.js";
import pool from "../config/db.js";

/*
|--------------------------------------------------------------------------
| CREATE SESSION (LOGIN)
|--------------------------------------------------------------------------
*/

export async function createSession(req, res) {
  try {
    const { email, password } = req.body || {};
    const userAgent = req.headers["user-agent"] || "unknown";
    const ipAddress = req.ip || req.connection.remoteAddress || null;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user by email
    const userResult = await pool.query(
      `
        SELECT id, name, email, role, password, mfa_enabled
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = userResult.rows[0];

    // Verify password (assuming you have bcrypt comparison)
    const bcrypt = await import("bcryptjs");
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // If MFA is enabled, return flag to frontend for MFA verification
    if (user.mfa_enabled) {
      return res.status(202).json({
        success: false,
        message: "MFA verification required",
        mfaRequired: true,
        userId: user.id,
        tempToken: Buffer.from(`${user.id}:${Date.now()}`).toString("base64"),
      });
    }

    // Create session
    const session = await SessionManager.createSession(user.id, userAgent, ipAddress, {
      name: "Login Session",
      type: "web",
    });

    return res.status(200).json({
      success: true,
      message: "Session created successfully",
      token: session.token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      session: {
        id: session.sessionId,
        deviceId: session.deviceId,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("Create session error:", error);

    return res.status(500).json({
      success: false,
      message: "Session creation failed",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| REFRESH SESSION TOKEN
|--------------------------------------------------------------------------
*/

export async function refreshSession(req, res) {
  try {
    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    const newTokenData = await SessionManager.refreshToken(sessionId);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      token: newTokenData.token,
      expiresAt: newTokenData.expiresAt,
    });
  } catch (error) {
    console.error("Refresh session error:", error);

    return res.status(500).json({
      success: false,
      message: "Token refresh failed",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| VERIFY SESSION TOKEN
|--------------------------------------------------------------------------
*/

export async function verifySession(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const verifiedSession = await SessionManager.verifyToken(token);

    if (!verifiedSession.valid) {
      return res.status(401).json({
        success: false,
        message: verifiedSession.error || "Invalid session",
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      user: verifiedSession.user,
      session: {
        id: verifiedSession.sessionId,
        deviceId: verifiedSession.deviceId,
        deviceName: verifiedSession.deviceName,
      },
    });
  } catch (error) {
    console.error("Verify session error:", error);

    return res.status(500).json({
      success: false,
      message: "Session verification failed",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| LIST ACTIVE SESSIONS
|--------------------------------------------------------------------------
*/

export async function listSessions(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    const sessions = await SessionManager.listSessions(userId);

    return res.status(200).json({
      success: true,
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceName: session.device_name,
        deviceType: session.device_type,
        ipAddress: session.ip_address,
        createdAt: session.created_at,
        lastSeenAt: session.last_seen_at,
        expiresAt: session.expires_at,
        isCurrent: session.is_current,
      })),
    });
  } catch (error) {
    console.error("List sessions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to list sessions",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| REVOKE SESSION
|--------------------------------------------------------------------------
*/

export async function revokeSession(req, res) {
  try {
    const userId = req.user?.id;
    const { sessionId } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    // Verify session belongs to user
    const sessionResult = await pool.query(
      `SELECT id FROM auth_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    await SessionManager.revokeSession(sessionId);

    return res.status(200).json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    console.error("Revoke session error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke session",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| REVOKE ALL SESSIONS
|--------------------------------------------------------------------------
*/

export async function revokeAllSessions(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    await SessionManager.revokeAllSessions(userId);

    return res.status(200).json({
      success: true,
      message: "All sessions revoked successfully",
    });
  } catch (error) {
    console.error("Revoke all sessions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to revoke all sessions",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| LOGOUT (REVOKE CURRENT SESSION)
|--------------------------------------------------------------------------
*/

export async function logout(req, res) {
  try {
    const { sessionId } = req.body || {};

    if (sessionId) {
      await SessionManager.revokeSession(sessionId);
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
}
