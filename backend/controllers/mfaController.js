import { MFAManager } from "../services/mfaManager.js";
import { SessionManager } from "../services/sessionManager.js";
import pool from "../config/db.js";

/*
|--------------------------------------------------------------------------
| INITIATE TOTP MFA SETUP
|--------------------------------------------------------------------------
*/

export async function initiateTOTPSetup(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    // Get user email
    const userResult = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userEmail = userResult.rows[0].email;
    const setupData = await MFAManager.initiateTOTPSetup(userId, userEmail);

    return res.status(200).json({
      success: true,
      message: "TOTP setup initiated",
      secret: setupData.secret,
      qrCode: setupData.qrCode,
      manualEntry: setupData.manualEntry,
      expiresIn: setupData.expiresIn,
    });
  } catch (error) {
    console.error("Initiate TOTP setup error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to initiate TOTP setup",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| VERIFY TOTP AND COMPLETE MFA SETUP
|--------------------------------------------------------------------------
*/

export async function verifyTOTPSetup(req, res) {
  try {
    const userId = req.user?.id;
    const { code } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "TOTP code is required",
      });
    }

    const result = await MFAManager.verifyTOTPAndSetup(userId, String(code).trim());

    return res.status(200).json({
      success: true,
      message: result.message,
      backupCodes: result.backupCodes,
    });
  } catch (error) {
    console.error("Verify TOTP setup error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to verify TOTP code",
    });
  }
}

/*
|--------------------------------------------------------------------------
| VERIFY MFA DURING LOGIN
|--------------------------------------------------------------------------
*/

export async function verifyMFALogin(req, res) {
  try {
    const { userId, code, isBackupCode } = req.body || {};
    const ipAddress = req.ip || req.connection.remoteAddress || null;

    if (!userId || !code) {
      return res.status(400).json({
        success: false,
        message: "User ID and verification code are required",
      });
    }

    let isValid = false;

    if (isBackupCode) {
      isValid = await MFAManager.verifyBackupCode(userId, String(code).trim());
    } else {
      isValid = await MFAManager.verifyTOTP(userId, String(code).trim(), ipAddress);
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Get user details
    const userResult = await pool.query(
      `
        SELECT id, name, email, role
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];
    const userAgent = req.headers["user-agent"] || "unknown";

    // Create session
    const session = await SessionManager.createSession(userId, userAgent, ipAddress, {
      name: "MFA Verified Session",
      type: "web",
    });

    return res.status(200).json({
      success: true,
      message: "MFA verification successful",
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
    console.error("Verify MFA login error:", error);

    return res.status(500).json({
      success: false,
      message: "MFA verification failed",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| GET MFA STATUS
|--------------------------------------------------------------------------
*/

export async function getMFAStatus(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    const status = await MFAManager.getMFAStatus(userId);

    return res.status(200).json({
      success: true,
      mfa: status,
    });
  } catch (error) {
    console.error("Get MFA status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get MFA status",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| DISABLE MFA
|--------------------------------------------------------------------------
*/

export async function disableMFA(req, res) {
  try {
    const userId = req.user?.id;
    const { password } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required to disable MFA",
      });
    }

    // Verify password
    const userResult = await pool.query(`SELECT password FROM users WHERE id = $1`, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const bcrypt = await import("bcryptjs");
    const passwordMatch = await bcrypt.compare(password, userResult.rows[0].password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    await MFAManager.disableMFA(userId);

    return res.status(200).json({
      success: true,
      message: "MFA disabled successfully",
    });
  } catch (error) {
    console.error("Disable MFA error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to disable MFA",
      error: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| GET BACKUP CODES COUNT
|--------------------------------------------------------------------------
*/

export async function getBackupCodesCount(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication is required",
      });
    }

    const count = await MFAManager.getBackupCodesCount(userId);

    return res.status(200).json({
      success: true,
      unusedBackupCodes: count,
    });
  } catch (error) {
    console.error("Get backup codes count error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get backup codes count",
      error: error.message,
    });
  }
}
