import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENCODING = "hex";

/**
 * Get encryption key from environment or generate from secret
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required in environment variables");
  }
  // Ensure key is exactly 32 bytes for aes-256
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt sensitive data
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data with IV and auth tag
 */
export function encrypt(plaintext) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", ENCODING);
    encrypted += cipher.final(ENCODING);

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt sensitive data
 * @param {string} ciphertext - Encrypted data (format: iv:authTag:encrypted)
 * @returns {string} Decrypted plaintext
 */
export function decrypt(ciphertext) {
  try {
    const key = getEncryptionKey();
    const parts = ciphertext.split(":");

    if (parts.length !== 3) {
      throw new Error("Invalid ciphertext format");
    }

    const iv = Buffer.from(parts[0], ENCODING);
    const authTag = Buffer.from(parts[1], ENCODING);
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, ENCODING, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Hash sensitive data for comparison (one-way)
 * @param {string} plaintext - Data to hash
 * @returns {string} SHA-256 hash
 */
export function hash(plaintext) {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Generate random token
 * @param {number} length - Token length in bytes
 * @returns {string} Random hex token
 */
export function generateToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate device ID fingerprint from user agent and IP
 * @param {string} userAgent - User-Agent header
 * @param {string} ipAddress - Client IP address
 * @returns {string} Device fingerprint
 */
export function generateDeviceFingerprint(userAgent, ipAddress) {
  const data = `${userAgent}|${ipAddress}`;
  return hash(data);
}
