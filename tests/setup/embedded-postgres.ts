import { execSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { userInfo } from "node:os"
import { assertSafeTestDatabaseUrl } from "../utils/test-database-url"
import { type EmbeddedPostgresCtor, loadEmbeddedPostgres } from "./embedded-postgres-loader"

let pg: InstanceType<EmbeddedPostgresCtor> | null = null

const EMBEDDED_PG_PORT = 5488
const EMBEDDED_PG_DB = "clabot_test"
const DATA_DIR = resolve(process.cwd(), "tmp", "embedded-pg")

/**
 * Embedded Postgres is the default for every test run. The ONLY way to point
 * the suites at another database is the explicit `TEST_DATABASE_URL` opt-in.
 *
 * In particular `.env.local` (usually a `vercel env pull` snapshot with a real
 * Neon URL) and a stray `DATABASE_URL` in the shell are ignored here, because
 * the suites truncate tables on every reset.
 */
export async function setup() {
  const explicitTestDatabaseUrl = process.env.TEST_DATABASE_URL?.trim()
  if (explicitTestDatabaseUrl) {
    assertSafeTestDatabaseUrl(explicitTestDatabaseUrl)
    process.env.DATABASE_URL = explicitTestDatabaseUrl
    console.log("[embedded-postgres] TEST_DATABASE_URL set, skipping embedded Postgres")
    return
  }

  // Clean up stale data directory from previous runs that may have crashed
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true })
  }

  // Only create a postgres system user when running as root (e.g. sandboxed environments).
  // On CI (GitHub Actions), the postgres user/group already exists and we run as non-root.
  const isRoot = userInfo().uid === 0

  const EmbeddedPostgres = await loadEmbeddedPostgres()
  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: EMBEDDED_PG_PORT,
    persistent: false,
    ...(isRoot ? { createPostgresUser: true } : {}),
  })

  console.log("[embedded-postgres] Starting embedded PostgreSQL...")
  await pg.initialise()
  await pg.start()
  await pg.createDatabase(EMBEDDED_PG_DB)

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${EMBEDDED_PG_PORT}/${EMBEDDED_PG_DB}`
  process.env.DATABASE_URL = databaseUrl

  console.log("[embedded-postgres] Running migrations...")
  execSync("pnpm db:migrate", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
    cwd: process.cwd(),
  })

  console.log(`[embedded-postgres] Ready: ${databaseUrl}`)
}

export async function teardown() {
  if (pg) {
    console.log("[embedded-postgres] Stopping...")
    await pg.stop()
    pg = null
  }
}

// Playwright globalSetup expects a default export function that returns a teardown function
export default async function globalSetup() {
  await setup()
  return teardown
}
