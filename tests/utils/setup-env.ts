/**
 * Vitest setupFile for integration tests.
 *
 * Runs before any test module is imported, so environment variables set here
 * are visible when server-side modules (lib/db/index.ts, etc.) are evaluated.
 *
 * Mirrors the DATABASE_URL fallback logic in tests/utils/db-reset.ts.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

function readEnvLocal(): Record<string, string> {
  const envLocalPath = resolve(process.cwd(), ".env.local")
  if (!existsSync(envLocalPath)) return {}

  const result: Record<string, string> = {}
  for (const rawLine of readFileSync(envLocalPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const sep = line.indexOf("=")
    if (sep === -1) continue

    const key = line.slice(0, sep).trim()
    let value = line.slice(sep + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

// Populate process.env from .env.local for any key not already set.
const envLocal = readEnvLocal()
for (const [key, value] of Object.entries(envLocal)) {
  if (process.env[key] === undefined) {
    process.env[key] = value
  }
}
