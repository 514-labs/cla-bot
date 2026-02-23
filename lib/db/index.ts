import "server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// ── Types ──────────────────────────────────────────────────────────

export type Database = ReturnType<typeof createNeonDb>

// ── Neon client ────────────────────────────────────────────────────

function createNeonDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle({ client: sql, schema })
}

// ── Singleton ──────────────────────────────────────────────────────
// Store the Drizzle instance on globalThis so it survives Next.js
// hot reloads in development.

const globalForDb = globalThis as unknown as {
  __db?: Database
  __dbReady?: Promise<void>
}

function getDb(): Database {
  if (!globalForDb.__db) {
    globalForDb.__db = createNeonDb()
    // Kick off schema creation + seed immediately.
    globalForDb.__dbReady = initDb(globalForDb.__db).catch((err) => {
      console.error("[db] Init failed, will retry on next request:", err)
      globalForDb.__dbReady = undefined
      throw err
    })
  }
  return globalForDb.__db
}

async function initDb(db: Database) {
  // Create tables using raw SQL via the Neon HTTP driver.
  const sql = neon(process.env.DATABASE_URL!)
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_username TEXT NOT NULL UNIQUE,
      github_id INTEGER,
      avatar_url TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'contributor'
    )
  `
  await sql`
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
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS cla_archives (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      sha256 TEXT NOT NULL,
      cla_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(org_id, sha256)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS cla_signatures (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      cla_sha256 TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      github_username TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT NOT NULL
    )
  `

  // Seed with initial data
  const { seedDatabase } = await import("./seed")
  await seedDatabase(db)
}

// ── Export ──────────────────────────────────────────────────────────

export const db = getDb()

/**
 * Ensure the DB is fully initialized (schema created + seeded).
 * Call this at the top of any API route that reads/writes data.
 */
export async function ensureDbReady(): Promise<Database> {
  // If init hasn't started yet (first call or after a failure), kick it off
  if (!globalForDb.__dbReady && globalForDb.__db) {
    globalForDb.__dbReady = initDb(globalForDb.__db).catch((err) => {
      console.error("[db] Init retry failed:", err)
      globalForDb.__dbReady = undefined
      throw err
    })
  }
  if (globalForDb.__dbReady) {
    await globalForDb.__dbReady
  }
  return db
}

/**
 * Full reset -- truncate all data and re-seed.
 */
export async function resetDb(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!)
  await sql`TRUNCATE cla_signatures, cla_archives, organizations, users CASCADE`
  const { seedDatabase } = await import("./seed")
  await seedDatabase(db)
}
