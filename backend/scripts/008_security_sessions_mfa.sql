-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- AUTH SESSIONS TABLE
-- Tracks active sessions per device
-- ============================================
CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255) DEFAULT 'Unknown Device',
    device_type VARCHAR(50) DEFAULT 'desktop',
    token_fingerprint CHAR(64) NOT NULL UNIQUE,
    user_agent TEXT DEFAULT 'unknown',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    is_current BOOLEAN DEFAULT FALSE,
    CONSTRAINT valid_dates CHECK (expires_at > created_at)
);

CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_device_id ON auth_sessions(device_id);
CREATE INDEX idx_auth_sessions_token_fingerprint ON auth_sessions(token_fingerprint);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- ============================================
-- USER MFA TABLE
-- Stores MFA settings per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_mfa (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    mfa_type VARCHAR(50) DEFAULT 'totp',
    secret_encrypted BYTEA NOT NULL,
    email_encrypted BYTEA,
    phone_encrypted BYTEA,
    is_enabled BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    backup_codes_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_user_mfa_user_id ON user_mfa(user_id);
CREATE INDEX idx_user_mfa_is_enabled ON user_mfa(is_enabled);

-- ============================================
-- MFA BACKUP CODES TABLE
-- Stores encrypted backup codes for account recovery
-- ============================================
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL UNIQUE,
    code_encrypted BYTEA NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_use_code CHECK (NOT (is_used AND used_at IS NULL))
);

CREATE INDEX idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE INDEX idx_mfa_backup_codes_is_used ON mfa_backup_codes(is_used);

-- ============================================
-- MFA ATTEMPTS TABLE
-- Rate limiting for MFA verification attempts
-- ============================================
CREATE TABLE IF NOT EXISTS mfa_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES auth_sessions(id) ON DELETE CASCADE,
    attempt_type VARCHAR(50) NOT NULL,
    is_successful BOOLEAN DEFAULT FALSE,
    ip_address INET,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_attempt_type CHECK (attempt_type IN ('totp', 'email', 'sms', 'backup'))
);

CREATE INDEX idx_mfa_attempts_user_id ON mfa_attempts(user_id);
CREATE INDEX idx_mfa_attempts_attempted_at ON mfa_attempts(attempted_at);

-- ============================================
-- UPDATE USERS TABLE
-- Add MFA-related columns if not exists
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='mfa_enabled'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='mfa_verified_at'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_verified_at TIMESTAMPTZ;
    END IF;
END $$;
