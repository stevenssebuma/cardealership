// backend/middleware/authMiddleware.js

import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { SessionManager } from "../services/sessionManager.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "panda_motors_secret_key_2026";

function createSlidingWindowRateLimiter({ limit, windowMs, code, message }) {
  const attempts = new Map();

  return (req, res, next) => {
    const key = String(req.user?.id || req.ip || req.connection.remoteAddress || "anonymous");
    const now = Date.now();
    const history = attempts.get(key) || [];
    const recentAttempts = history.filter((time) => now - time < windowMs);

    if (recentAttempts.length >= limit) {
      return res.status(429).json({
        success: false,
        error: {
          code,
          message,
          status: 429,
          details: null,
        },
      });
    }

    recentAttempts.push(now);
    attempts.set(key, recentAttempts);

    return next();
  };
}

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Access denied. No token provided.",
        status: 401,
        details: null,
      },
    });
  }

  try {
    // Try SessionManager verification first (new method)
    const verifiedSession = await SessionManager.verifyToken(token);

    if (verifiedSession.valid) {
      req.user = verifiedSession.user;
      req.session = {
        id: verifiedSession.sessionId,
        deviceId: verifiedSession.deviceId,
        deviceName: verifiedSession.deviceName,
      };
      return next();
    }

    // If SessionManager verification fails, try JWT (fallback for legacy tokens)
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "Token has expired. Please login again.",
          status: 401,
          details: null,
        },
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid token. Access denied.",
        status: 401,
        details: null,
      },
    });
  }
};

export const checkRole = (allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required.",
        status: 401,
        details: null,
      },
    });
  }

  const userRole = req.user.role || "user";

  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "ADMIN_ACCESS_REQUIRED",
        message: "Access denied. Insufficient permissions.",
        status: 403,
        details: {
          requiredRoles: allowedRoles,
          yourRole: userRole,
        },
      },
    });
  }

  return next();
};

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      // Try SessionManager verification first
      const verifiedSession = await SessionManager.verifyToken(token);

      if (verifiedSession.valid) {
        req.user = verifiedSession.user;
        req.session = {
          id: verifiedSession.sessionId,
          deviceId: verifiedSession.deviceId,
          deviceName: verifiedSession.deviceName,
        };
        return next();
      }

      // Fallback to JWT
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }

  return next();
};

export const generateToken = (user) => {
  const payload = {
    id: user.id || user._id,
    email: user.email,
    role: user.role || "user",
    name: user.name || user.user_name,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

export const rateLimitLogin = createSlidingWindowRateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  code: "TOO_MANY_LOGIN_ATTEMPTS",
  message: "Too many login attempts. Please try again in 15 minutes.",
});

export const rateLimitProtectedRoute = createSlidingWindowRateLimiter({
  limit: 120,
  windowMs: 15 * 60 * 1000,
  code: "TOO_MANY_REQUESTS",
  message: "Too many authenticated requests. Please wait and try again.",
});

export const protect = authenticateToken;
export const adminOnly = checkRole(["admin"]);

export default {
  authenticateToken,
  protect,
  checkRole,
  adminOnly,
  rateLimitProtectedRoute,
  optionalAuth,
  generateToken,
  verifyToken,
  decodeToken,
  rateLimitLogin,
};
