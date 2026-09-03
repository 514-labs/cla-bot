/**
 * Fully local development harness: no real GitHub, no remote database.
 *
 *   pnpm exec jiti scripts/dev-local.ts        (or `pnpm dev:local`)
 *
 * 1. Starts a PERSISTENT embedded Postgres in tmp/embedded-pg-dev (port 5489,
 *    database clabot_dev) and runs `pnpm db:migrate` against it.
 * 2. Starts the mock GitHub server (scripts/mock-github-server.ts).
 * 3. Spawns `pnpm dev` with the environment pointed at both.
 *
 * Env knobs: PORT (app port, default 3000), MOCK_GITHUB_PORT (default 3998).
 * Ctrl-C tears everything down; the Postgres data dir survives between runs.
 */

import { execSync, spawn, type ChildProcess } from "node:child_process"
import { existsSync, readdirSync, rmSync } from "node:fs"
import { userInfo } from "node:os"
import { resolve } from "node:path"
import EmbeddedPostgres from "embedded-postgres"
import { startMockGitHubServer, type MockGitHubServerHandle } from "./mock-github-server"

const APP_PORT = Number(process.env.PORT ?? "3000")
const MOCK_GITHUB_PORT = Number(process.env.MOCK_GITHUB_PORT ?? "3998")
const PG_PORT = 5489
const PG_DB = "clabot_dev"
const PG_USER = "postgres"
const PG_PASSWORD = "postgres"
const PG_DATA_DIR = resolve(process.cwd(), "tmp", "embedded-pg-dev")
const DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}`

let pg: EmbeddedPostgres | null = null
let mockGitHub: MockGitHubServerHandle | null = null
let child: ChildProcess | null = null
let shuttingDown = false

async function startPostgres(): Promise<void> {
  // Only create a postgres system user when running as root (sandboxed environments).
  const isRoot = userInfo().uid === 0
  pg = new EmbeddedPostgres({
    databaseDir: PG_DATA_DIR,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    ...(isRoot ? { createPostgresUser: true } : {}),
  })

  // PG_VERSION marks an initialised cluster. A directory without it is the debris
  // of a failed initdb (which refuses to run on a non-empty directory) — clear it.
  if (!existsSync(resolve(PG_DATA_DIR, "PG_VERSION"))) {
    if (existsSync(PG_DATA_DIR) && readdirSync(PG_DATA_DIR).length > 0) {
      console.log(`[dev-local] Removing incomplete Postgres data dir ${PG_DATA_DIR}`)
      rmSync(PG_DATA_DIR, { recursive: true, force: true })
    }
    console.log(`[dev-local] Initialising embedded Postgres in ${PG_DATA_DIR}`)
    await pg.initialise()
  }

  console.log(`[dev-local] Starting embedded Postgres on port ${PG_PORT}`)
  await pg.start()

  try {
    await pg.createDatabase(PG_DB)
  } catch {
    // Database already exists from a previous run — that is the point of `persistent: true`.
  }

  console.log("[dev-local] Running migrations")
  execSync("pnpm db:migrate", {
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
    cwd: process.cwd(),
  })
}

function buildChildEnv(mockGitHubBaseUrl: string): NodeJS.ProcessEnv {
  // Next.js loads .env.local itself but never overrides variables that are
  // already present in process.env, so everything set explicitly here wins over
  // the developer's .env.local (which typically points at Neon + real GitHub).
  return {
    ...process.env,
    PORT: String(APP_PORT),
    DATABASE_URL,
    SEED_DATABASE: "true",
    USE_REAL_GITHUB_APP: "false",
    ENABLE_TEST_SUPPORT: "true",
    GITHUB_OAUTH_BASE_URL: mockGitHubBaseUrl,
    GITHUB_API_BASE_URL: mockGitHubBaseUrl,
    GITHUB_CLIENT_ID: "mock-client-id",
    GITHUB_CLIENT_SECRET: "mock-client-secret",
    // Only defaulted when the developer has not set their own.
    SESSION_SECRET: process.env.SESSION_SECRET || "cla-bot-local-dev-session-secret",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "cla-bot-local-dev-encryption-key",
  }
}

function printBanner(mockGitHubBaseUrl: string) {
  const appUrl = `http://localhost:${APP_PORT}`
  console.log("")
  console.log("┌──────────────────────────────────────────────────────────────")
  console.log("│ cla-bot local dev (no real GitHub, no remote DB)")
  console.log(`│ App:          ${appUrl}`)
  console.log(`│ Mock GitHub:  ${mockGitHubBaseUrl}`)
  console.log(`│ Database:     ${DATABASE_URL}`)
  console.log(`│ Sign in with any mock user at ${appUrl}/auth/signin`)
  console.log("│ (orgadmin is admin of fiveonefour + moose-stack; Ctrl-C stops everything)")
  console.log("└──────────────────────────────────────────────────────────────")
  console.log("")
}

async function shutdown(exitCode: number): Promise<never> {
  if (shuttingDown) return new Promise<never>(() => {})
  shuttingDown = true
  console.log("\n[dev-local] Shutting down")

  if (child && child.exitCode === null && child.signalCode === null) {
    const target = child
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        signalChildGroup(target, "SIGKILL")
        done()
      }, 5000)
      target.once("exit", () => {
        clearTimeout(timer)
        done()
      })
      signalChildGroup(target, "SIGTERM")
    })
  }

  if (mockGitHub) {
    await mockGitHub.close().catch(() => {})
    mockGitHub = null
  }

  if (pg) {
    try {
      await pg.stop()
    } catch (error) {
      console.error("[dev-local] Failed to stop embedded Postgres", error)
    }
    pg = null
  }

  process.exit(exitCode)
}

/**
 * `pnpm dev` is itself a wrapper around `next dev`; signalling only the wrapper
 * can leave `next` orphaned and still bound to the port. The child is spawned
 * as its own process group (`detached: true`) so the whole tree can be signalled.
 */
function signalChildGroup(target: ChildProcess, signal: NodeJS.Signals) {
  if (!target.pid) return
  try {
    process.kill(-target.pid, signal)
  } catch {
    target.kill(signal)
  }
}

async function main() {
  process.once("SIGINT", () => void shutdown(130))
  process.once("SIGTERM", () => void shutdown(143))

  await startPostgres()

  mockGitHub = await startMockGitHubServer({ port: MOCK_GITHUB_PORT })
  console.log(`[dev-local] Mock GitHub listening on ${mockGitHub.baseUrl}`)

  printBanner(mockGitHub.baseUrl)

  // No shell: argv is passed through verbatim, nothing is interpreted as shell syntax.
  child = spawn("pnpm", ["dev", "--port", String(APP_PORT)], {
    env: buildChildEnv(mockGitHub.baseUrl),
    stdio: "inherit",
    shell: false,
    detached: true,
  })

  child.once("error", (error) => {
    console.error("[dev-local] Failed to start `pnpm dev`", error)
    void shutdown(1)
  })
  child.once("exit", (code, signal) => {
    if (shuttingDown) return
    console.log(`[dev-local] \`pnpm dev\` exited (${signal ?? code})`)
    void shutdown(code ?? 1)
  })
}

main().catch((error) => {
  console.error("[dev-local] Fatal", error)
  void shutdown(1)
})
