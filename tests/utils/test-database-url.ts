/**
 * Single source of truth for which database the test suites may touch.
 *
 * Tests TRUNCATE tables, so they must never run against a shared or remote
 * database by accident. The rules are:
 *
 * 1. `TEST_DATABASE_URL`, when set, is used verbatim (explicit opt-in).
 * 2. Otherwise `DATABASE_URL` from the *process environment* is used. The
 *    embedded Postgres global setup populates this before tests start.
 * 3. `.env.local` is deliberately NOT consulted — it typically holds a
 *    `vercel env pull` snapshot pointing at a real Neon database.
 * 4. Unless `ALLOW_REMOTE_TEST_DATABASE=true`, the host must be local.
 */

import { isLocalDatabaseUrl } from "@/lib/db/database-url"

export { isLocalDatabaseUrl }

export function getTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim()
  if (!url) return undefined
  assertSafeTestDatabaseUrl(url)
  return url
}

export function requireTestDatabaseUrl(): string {
  const url = getTestDatabaseUrl()
  if (!url) {
    throw new Error(
      "No test database configured. Run through `pnpm test:integration` / `pnpm test:e2e` (embedded Postgres) or set TEST_DATABASE_URL explicitly."
    )
  }
  return url
}

export function assertSafeTestDatabaseUrl(url: string): void {
  if (process.env.ALLOW_REMOTE_TEST_DATABASE === "true") return
  if (isLocalDatabaseUrl(url)) return

  let host = "<unparseable>"
  try {
    host = new URL(url).hostname
  } catch {
    // keep placeholder
  }
  throw new Error(
    `Refusing to run tests against non-local database host "${host}". ` +
      "Tests truncate tables. Use embedded Postgres (default) or set ALLOW_REMOTE_TEST_DATABASE=true if you really mean it."
  )
}
