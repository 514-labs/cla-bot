import "server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http"
import postgres from "postgres"
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

// ── Types ──────────────────────────────────────────────────────────

// Tagged-template SQL function compatible with both neon() and postgres()
type RawSqlFn = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>

export type Database = ReturnType<typeof createDb>

// ── Helpers ────────────────────────────────────────────────────────

/** Returns true when the URL points at a Neon serverless endpoint. */
function isNeonUrl(url: string): boolean {
  return /neon\.tech|neondb\.net/.test(url)
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required")
  }
  return databaseUrl
}

// ── Raw SQL (for migration checks & reset) ─────────────────────────

let _pgClient: ReturnType<typeof postgres> | null = null

function createRawSql(url: string): RawSqlFn {
  if (isNeonUrl(url)) {
    return neon(url) as unknown as RawSqlFn
  }
  if (!_pgClient) {
    _pgClient = postgres(url)
  }
  return _pgClient as unknown as RawSqlFn
}

// ── Drizzle instance ───────────────────────────────────────────────

function createDb() {
  const url = getDatabaseUrl()
  if (isNeonUrl(url)) {
    const sql = neon(url)
    return drizzleNeonHttp({ client: sql, schema })
  }
  _pgClient = postgres(url)
  return drizzlePostgresJs({ client: _pgClient, schema })
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
    globalForDb.__db = createDb()
    // Kick off migration verification + optional seed immediately.
    globalForDb.__dbReady = initDb(globalForDb.__db).catch((err) => {
      console.error("[db] Init failed, will retry on next request:", err)
      globalForDb.__dbReady = undefined
      throw err
    })
  }
  return globalForDb.__db
}

async function initDb(db: Database) {
  if (isNextBuildPhase()) {
    return
  }

  await assertMigrationsApplied()

  if (shouldSeedDatabase()) {
    const { seedDatabase } = await import("./seed")
    await seedDatabase(db)
  }
}

async function assertMigrationsApplied() {
  const sql = createRawSql(getDatabaseUrl())
  const migrationsTable = process.env.DRIZZLE_MIGRATIONS_TABLE ?? "__drizzle_migrations"
  const migrationsSchema = process.env.DRIZZLE_MIGRATIONS_SCHEMA
  try {
    if (process.env.NODE_ENV === "production") {
      const migrationsRows = migrationsSchema
        ? await sql`
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = ${migrationsSchema}
              AND table_name = ${migrationsTable}
            LIMIT 1
          `
        : await sql`
            SELECT 1
            FROM information_schema.tables
            WHERE table_name = ${migrationsTable}
            ORDER BY CASE WHEN table_schema = 'drizzle' THEN 0 ELSE 1 END
            LIMIT 1
          `
      if (migrationsRows.length === 0) {
        if (migrationsSchema) {
          throw new Error(`relation "${migrationsSchema}.${migrationsTable}" does not exist`)
        }
        throw new Error(`relation "${migrationsTable}" does not exist`)
      }
      await sql`SELECT 1 FROM users LIMIT 1`
      await sql`SELECT 1 FROM cla_signatures LIMIT 1`
      await sql`SELECT 1 FROM org_cla_bypass_accounts LIMIT 1`
      await sql`SELECT 1 FROM webhook_deliveries LIMIT 1`
      await sql`SELECT 1 FROM audit_events LIMIT 1`
      return
    }
    await sql`SELECT 1 FROM users LIMIT 1`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[db] Drizzle migrations are not fully applied. Run "pnpm db:migrate" before starting the app (Vercel build command should run migrations before build). If you use a custom migrations schema/table, set DRIZZLE_MIGRATIONS_SCHEMA and DRIZZLE_MIGRATIONS_TABLE for both build and runtime. Underlying error: ${message}`
    )
  }
}

// ── Export ──────────────────────────────────────────────────────────

const db = getDb()

/**
 * Ensure the DB is fully initialized (migrations applied + optional seed).
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

function shouldSeedDatabase() {
  if (process.env.SEED_DATABASE === "true") return true
  return false
}

function isNextBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build"
}
