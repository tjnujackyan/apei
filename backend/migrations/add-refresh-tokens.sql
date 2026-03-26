-- Migration: Add refresh_tokens table for token refresh mechanism
-- Date: 2024-12-29

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(36) PRIMARY KEY,
    userId VARCHAR(36) NOT NULL,
    token VARCHAR(36) NOT NULL UNIQUE,
    expiresAt DATETIME NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_refresh_tokens_userId (userId),
    INDEX idx_refresh_tokens_token (token),
    INDEX idx_refresh_tokens_expiresAt (expiresAt)
);

-- Note: TypeORM with synchronize:true will auto-create this table
-- This migration is for manual deployment or production environments
