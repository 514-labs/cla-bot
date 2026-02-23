import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "@playwright/test"

const ROOT_DIR = process.cwd()

function loadEnvFile(path: string) {
  if (!existsSync(path)) return

  const fileContents = readFileSync(path, "utf8")
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separator = line.indexOf("=")
    if (separator <= 0) continue

    const key = line.slice(0, separator).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(resolve(ROOT_DIR, ".env.local"))

const SESSION_SECRET =
  process.env.SESSION_SECRET ?? process.env.TEST_SESSION_SECRET ?? "cla-bot-test-session-secret"
process.env.SESSION_SECRET = SESSION_SECRET
const SHELL_SAFE_SESSION_SECRET = `'${SESSION_SECRET.replaceAll("'", "'\\''")}'`

const PORT = Number.parseInt(
  process.env.TEST_PORT ?? process.env.PLAYWRIGHT_TEST_PORT ?? "3210",
  10
)
const BASE_URL =
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`
const SHOULD_START_WEB_SERVER = !process.env.TEST_BASE_URL && !process.env.PLAYWRIGHT_BASE_URL
const CHANNEL =
  process.env.PLAYWRIGHT_CHANNEL ??
  (existsSync("/Applications/Google Chrome.app") ? "chrome" : undefined)

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    ...(CHANNEL ? { channel: CHANNEL } : {}),
  },
  webServer: SHOULD_START_WEB_SERVER
    ? {
        command: `SESSION_SECRET=${SHELL_SAFE_SESSION_SECRET} pnpm dev --port ${PORT}`,
        url: `${BASE_URL}/api/auth/session`,
        timeout: 90_000,
        reuseExistingServer: true,
      }
    : undefined,
})
