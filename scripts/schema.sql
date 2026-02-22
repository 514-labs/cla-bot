-- CLA Bot Database Schema for Neon Postgres
-- This matches the Drizzle schema in lib/db/schema.ts

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_username TEXT NOT NULL UNIQUE,
  avatar_url TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor'
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  github_org_slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  cla_text TEXT NOT NULL DEFAULT '',
  cla_text_sha256 TEXT
);

CREATE TABLE IF NOT EXISTS cla_archives (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  sha256 TEXT NOT NULL,
  cla_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(org_id, sha256)
);

CREATE TABLE IF NOT EXISTS cla_signatures (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  cla_sha256 TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  github_username TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signatures_org ON cla_signatures(org_id);
CREATE INDEX IF NOT EXISTS idx_signatures_user ON cla_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(github_org_slug);
