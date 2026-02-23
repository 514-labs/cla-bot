-- Migration: add installation_id to organizations and github_id to users
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS installation_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id INTEGER;
