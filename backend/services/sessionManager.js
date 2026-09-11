import pool from "../config/db.js";
import { generateToken, generateDeviceFingerprint, hash } from "../utils/encryption.js";

const SESSION_TOKEN_EXPIRY_DAYS = 7;
const MAX_SESSIONS_PER_USER = 5;

/**
 * SessionManager handles device-aware multi-session token management
 */
export class SessionManager {
  /**
   * Create a new session for a device
   * @param {number} userId - User ID
   * @param {string} userAgent - User-Agent header
   * @param {string} ipAddress - Client IP address
   * @param {object} deviceInfo - Device information
   * @returns {Promise<object>} Session with token
   */
  static async createSession(userId, userAgent, ipAddress, deviceInfo = {}) {
    try {
      // Generate unique device ID
      const deviceId = generateToken(16);
      const deviceName = deviceInfo.name || "Unknown Device";
      const deviceType = deviceInfo.type || this.detectDeviceType(userAgent);

      // Generate session token and fingerprint
      const token = generateToken(32);
      const tokenFingerprint = hash(token);

      // Calculate expiry
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + SESSION_TOKEN_EXPIRY_DAYS);

      // Check max sessions limit and revoke oldest if needed
      await this.enforceMaxSessions(userId);

      // Create session in database
      const result = await pool.query(
        `
          INSERT INTO auth_sessions (
            user_id,
            device_id,
            device_name,
            device_type,
            token_fingerprint,
            user_agent,
            ip_address,
            expires_at,
            is_current
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
          RETURNING
            id,
            user_id,
            device_id,
            device_name,
            device_type,
            created_at,
            expires_at
        `,
        [userId, deviceId, deviceName, deviceType, tokenFingerprint, userAgent, ipAddress, expiryDate]
      );

      if (result.rows.length === 0) {
        throw new Error("Failed to create session");
      }

      const session = result.rows[0];

      return {
        sessionId: session.id,
        userId: session.user_id,
        deviceId: session.device_id,
        deviceName: session.device_name,
        deviceType: session.device_type,
        token,
        expiresAt: session.expires_at,
        createdAt: session.created_at,
      };
    } catch (error) {
      console.error("Create session error:", error);
      throw error;
    }
  }

  /**
   * Verify and update a session token
   * @param {string} token - Session token
   * @returns {Promise<object>} Verified session with user info
   */
  static async verifyToken(token) {
    try {
      const tokenFingerprint = hash(token);

      const result = await pool.query(
        `
          SELECT
            s.id,
            s.user_id,
            s.device_id,
            s.device_name,
            s.expires_at,
            s.revoked_at,
            u.id as user_id,
            u.email,
            u.name,
            u.role
          FROM auth_sessions s
          JOIN users u ON s.user_id = u.id
          WHERE s.token_fingerprint = $1
            AND s.revoked_at IS NULL
            AND s.expires_at > NOW()
          LIMIT 1
        `,
        [tokenFingerprint]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: "Invalid or expired session" };
      }

      const session = result.rows[0];

      // Update last seen timestamp
      await pool.query(
        `UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1`,
        [session.id]
      );

      return {
        valid: true,
        sessionId: session.id,
        userId: session.user_id,
        deviceId: session.device_id,
        deviceName: session.device_name,
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name,
          role: session.role,
        },
      };
    } catch (error) {
      console.error("Verify token error:", error);
      return { valid: false, error: "Token verification failed" };
    }
  }

  /**
   * Refresh an expiring session token
   * @param {number} sessionId - Session ID
   * @returns {Promise<object>} New token
   */
  static async refreshToken(sessionId) {
    try {
      const newToken = generateToken(32);
      const newTokenFingerprint = hash(newToken);
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + SESSION_TOKEN_EXPIRY_DAYS);

      const result = await pool.query(
        `
          UPDATE auth_sessions
          SET token_fingerprint = $1, expires_at = $2, last_seen_at = NOW()
          WHERE id = $3 AND revoked_at IS NULL
          RETURNING expires_at
        `,
        [newTokenFingerprint, expiryDate, sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error("Session not found or already revoked");
      }

      return {
        token: newToken,
        expiresAt: result.rows[0].expires_at,
      };
    } catch (error) {
      console.error("Refresh token error:", error);
      throw error;
    }
  }

  /**
   * Revoke a session
   * @param {number} sessionId - Session ID
   */
  static async revokeSession(sessionId) {
    try {
      await pool.query(
        `UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`,
        [sessionId]
      );
    } catch (error) {
      console.error("Revoke session error:", error);
      throw error;
    }
  }

  /**
   * Revoke all sessions for a user
   * @param {number} userId - User ID
   */
  static async revokeAllSessions(userId) {
    try {
      await pool.query(
        `UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    } catch (error) {
      console.error("Revoke all sessions error:", error);
      throw error;
    }
  }

  /**
   * List active sessions for a user
   * @param {number} userId - User ID
   * @returns {Promise<array>} List of active sessions
   */
  static async listSessions(userId) {
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            device_id,
            device_name,
            device_type,
            user_agent,
            ip_address,
            created_at,
            last_seen_at,
            expires_at,
            is_current
          FROM auth_sessions
          WHERE user_id = $1 AND revoked_at IS NULL
          ORDER BY last_seen_at DESC
        `,
        [userId]
      );

      return result.rows;
    } catch (error) {
      console.error("List sessions error:", error);
      throw error;
    }
  }

  /**
   * Enforce maximum sessions limit per user
   * @param {number} userId - User ID
   */
  static async enforceMaxSessions(userId) {
    try {
      const result = await pool.query(
        `
          SELECT id FROM auth_sessions
          WHERE user_id = $1 AND revoked_at IS NULL
          ORDER BY created_at ASC
          OFFSET $2
        `,
        [userId, MAX_SESSIONS_PER_USER]
      );

      if (result.rows.length > 0) {
        const idsToRevoke = result.rows.map((row) => row.id);
        await pool.query(
          `UPDATE auth_sessions SET revoked_at = NOW() WHERE id = ANY($1)`,
          [idsToRevoke]
        );
      }
    } catch (error) {
      console.error("Enforce max sessions error:", error);
      throw error;
    }
  }

  /**
   * Detect device type from user agent
   * @param {string} userAgent - User-Agent header
   * @returns {string} Device type
   */
  static detectDeviceType(userAgent = "") {
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android"))
      return "mobile";
    if (ua.includes("tablet") || ua.includes("ipad")) return "tablet";
    return "desktop";
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions() {
    try {
      const result = await pool.query(
        `DELETE FROM auth_sessions WHERE expires_at < NOW() AND revoked_at IS NOT NULL`
      );

      console.log(`Cleaned up ${result.rowCount} expired sessions`);
    } catch (error) {
      console.error("Cleanup expired sessions error:", error);
      throw error;
    }
  }
}

export default SessionManager;
