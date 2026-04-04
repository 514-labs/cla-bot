import EmbeddedPostgres from "embedded-postgres"
import { execSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"

let pg: EmbeddedPostgres | null = null

const EMBEDDED_PG_PORT = 5488
const EMBEDDED_PG_DB = "clabot_test"
const DATA_DIR = resolve(process.cwd(), "tmp", "embedded-pg")

function hasDatabaseUrl(): boolean {
  if (process.env.DATABASE_URL) return true

  const envPath = resolve(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return false

  const contents = readFileSync(envPath, "utf8")
  return contents.split(/\r?\n/).some((line) => {
    const trimmed = line.trim()
    return !trimmed.startsWith("#") && trimmed.startsWith("DATABASE_URL=")
  })
}

export async function setup() {
  if (hasDatabaseUrl()) {
    console.log("[embedded-postgres] DATABASE_URL already set, skipping embedded Postgres")
    return
  }

  // Clean up stale data directory from previous runs that may have crashed
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true })
  }

  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: EMBEDDED_PG_PORT,
    persistent: false,
    createPostgresUser: true,
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
