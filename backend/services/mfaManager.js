import pool from "../config/db.js";
import { encrypt, decrypt, hash, generateToken } from "../utils/encryption.js";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

const BACKUP_CODES_COUNT = 10;
const MFA_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MFA_MAX_ATTEMPTS = 5;

/**
 * MFAManager handles multi-factor authentication setup and verification
 */
export class MFAManager {
  /**
   * Initiate TOTP MFA setup
   * @param {number} userId - User ID
   * @param {string} userEmail - User email for QR code label
   * @returns {Promise<object>} Secret and QR code
   */
  static async initiateTOTPSetup(userId, userEmail) {
    try {
      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `Panda Motors (${userEmail})`,
        issuer: "Panda Motors",
        length: 32,
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);

      // Encrypt and store secret temporarily (not yet verified)
      const encryptedSecret = encrypt(secret.base32);

      // Check if user already has MFA setup
      const existing = await pool.query(
        `SELECT id FROM user_mfa WHERE user_id = $1`,
        [userId]
      );

      if (existing.rows.length > 0) {
        // Update existing MFA record
        await pool.query(
          `
            UPDATE user_mfa
            SET secret_encrypted = $1, is_verified = FALSE, updated_at = NOW()
            WHERE user_id = $2
          `,
          [encryptedSecret, userId]
        );
      } else {
        // Create new MFA record
        await pool.query(
          `
            INSERT INTO user_mfa (user_id, mfa_type, secret_encrypted, is_verified)
            VALUES ($1, 'totp', $2, FALSE)
          `,
          [userId, encryptedSecret]
        );
      }

      return {
        secret: secret.base32,
        qrCode,
        manualEntry: secret.base32,
        expiresIn: "10 minutes",
      };
    } catch (error) {
      console.error("Initiate TOTP setup error:", error);
      throw error;
    }
  }

  /**
   * Verify TOTP code and complete MFA setup
   * @param {number} userId - User ID
   * @param {string} code - TOTP code from authenticator app
   * @returns {Promise<object>} Backup codes
   */
  static async verifyTOTPAndSetup(userId, code) {
    try {
      // Get the unverified secret
      const result = await pool.query(
        `
          SELECT id, secret_encrypted FROM user_mfa
          WHERE user_id = $1 AND is_verified = FALSE
        `,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error("No pending MFA setup found");
      }

      const mfaRecord = result.rows[0];
      const decryptedSecret = decrypt(mfaRecord.secret_encrypted);

      // Verify TOTP code (allow 30-second time window)
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: "base32",
        token: code,
        window: 2,
      });

      if (!verified) {
        throw new Error("Invalid TOTP code");
      }

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const backupCodesHash = hash(backupCodes.join(","));
      const backupCodesEncrypted = backupCodes.map((code) =>
        encrypt(code)
      );

      // Update MFA record as verified
      await pool.query(
        `
          UPDATE user_mfa
          SET is_verified = TRUE, is_enabled = TRUE, backup_codes_hash = $1, updated_at = NOW()
          WHERE id = $2
        `,
        [backupCodesHash, mfaRecord.id]
      );

      // Store encrypted backup codes
      for (const encryptedCode of backupCodesEncrypted) {
        await pool.query(
          `
            INSERT INTO mfa_backup_codes (user_id, code_hash, code_encrypted)
            VALUES ($1, $2, $3)
          `,
          [userId, hash(encryptedCode), encryptedCode]
        );
      }

      // Update users table
      await pool.query(
        `UPDATE users SET mfa_enabled = TRUE, mfa_verified_at = NOW() WHERE id = $1`,
        [userId]
      );

      return {
        backupCodes,
        message: "MFA setup completed successfully. Save your backup codes in a safe place.",
      };
    } catch (error) {
      console.error("Verify TOTP and setup error:", error);
      throw error;
    }
  }

  /**
   * Verify TOTP code during login
   * @param {number} userId - User ID
   * @param {string} code - TOTP code
   * @param {string} ipAddress - Client IP for logging
   * @returns {Promise<boolean>} True if valid
   */
  static async verifyTOTP(userId, code, ipAddress) {
    try {
      // Check rate limiting
      const recentAttempts = await pool.query(
        `
          SELECT COUNT(*) as count FROM mfa_attempts
          WHERE user_id = $1 AND attempted_at > NOW() - INTERVAL '15 minutes'
        `,
        [userId]
      );

      if (parseInt(recentAttempts.rows[0].count) >= MFA_MAX_ATTEMPTS) {
        throw new Error("Too many MFA attempts. Please try again later.");
      }

      // Get MFA secret
      const result = await pool.query(
        `
          SELECT secret_encrypted FROM user_mfa
          WHERE user_id = $1 AND is_enabled = TRUE AND is_verified = TRUE
        `,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error("MFA not enabled for this user");
      }

      const decryptedSecret = decrypt(result.rows[0].secret_encrypted);

      // Verify TOTP code
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: "base32",
        token: code,
        window: 2,
      });

      // Log attempt
      await pool.query(
        `
          INSERT INTO mfa_attempts (user_id, attempt_type, is_successful, ip_address)
          VALUES ($1, 'totp', $2, $3)
        `,
        [userId, verified, ipAddress]
      );

      // Update last_used_at
      if (verified) {
        await pool.query(
          `UPDATE user_mfa SET last_used_at = NOW() WHERE user_id = $1`,
          [userId]
        );
      }

      return verified;
    } catch (error) {
      console.error("Verify TOTP error:", error);
      throw error;
    }
  }

  /**
   * Verify backup code
   * @param {number} userId - User ID
   * @param {string} code - Backup code
   * @returns {Promise<boolean>} True if valid
   */
  static async verifyBackupCode(userId, code) {
    try {
      const codeHash = hash(code);

      const result = await pool.query(
        `
          SELECT id FROM mfa_backup_codes
          WHERE user_id = $1 AND code_hash = $2 AND is_used = FALSE
          LIMIT 1
        `,
        [userId, codeHash]
      );

      if (result.rows.length === 0) {
        return false;
      }

      // Mark code as used
      await pool.query(
        `UPDATE mfa_backup_codes SET is_used = TRUE, used_at = NOW() WHERE id = $1`,
        [result.rows[0].id]
      );

      return true;
    } catch (error) {
      console.error("Verify backup code error:", error);
      return false;
    }
  }

  /**
   * Disable MFA for user
   * @param {number} userId - User ID
   */
  static async disableMFA(userId) {
    try {
      await pool.query(
        `UPDATE user_mfa SET is_enabled = FALSE, is_verified = FALSE WHERE user_id = $1`,
        [userId]
      );

      await pool.query(
        `UPDATE users SET mfa_enabled = FALSE WHERE id = $1`,
        [userId]
      );
    } catch (error) {
      console.error("Disable MFA error:", error);
      throw error;
    }
  }

  /**
   * Get MFA status for user
   * @param {number} userId - User ID
   * @returns {Promise<object>} MFA status
   */
  static async getMFAStatus(userId) {
    try {
      const result = await pool.query(
        `
          SELECT
            is_enabled,
            is_verified,
            mfa_type,
            created_at,
            last_used_at,
            (SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1 AND is_used = FALSE) as unused_backup_codes
          FROM user_mfa
          WHERE user_id = $1
        `,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          isEnabled: false,
          isVerified: false,
          mfaType: null,
          unusedBackupCodes: 0,
        };
      }

      const row = result.rows[0];
      return {
        isEnabled: row.is_enabled,
        isVerified: row.is_verified,
        mfaType: row.mfa_type,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        unusedBackupCodes: parseInt(row.unused_backup_codes),
      };
    } catch (error) {
      console.error("Get MFA status error:", error);
      throw error;
    }
  }

  /**
   * Generate backup codes
   * @returns {array} Array of backup codes
   */
  static generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
      codes.push(generateToken(4).toUpperCase());
    }
    return codes;
  }

  /**
   * Get remaining backup codes count
   * @param {number} userId - User ID
   * @returns {Promise<number>} Count of unused backup codes
   */
  static async getBackupCodesCount(userId) {
    try {
      const result = await pool.query(
        `
          SELECT COUNT(*) as count FROM mfa_backup_codes
          WHERE user_id = $1 AND is_used = FALSE
        `,
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error("Get backup codes count error:", error);
      return 0;
    }
  }
}

export default MFAManager;
