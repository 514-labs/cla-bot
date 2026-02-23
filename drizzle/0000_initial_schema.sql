CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_username TEXT NOT NULL UNIQUE,
  github_id INTEGER,
  github_access_token_encrypted TEXT,
  github_token_scopes TEXT,
  github_token_updated_at TEXT,
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
  installation_id INTEGER,
  cla_text TEXT NOT NULL DEFAULT '',
  cla_text_sha256 TEXT
);

CREATE TABLE IF NOT EXISTS cla_archives (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  sha256 TEXT NOT NULL,
  cla_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT cla_archives_org_sha256_idx UNIQUE(org_id, sha256)
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
