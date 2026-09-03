/**
 * Shared notion of "this database URL points at the local machine".
 *
 * Used by the dev-only test-support endpoint before doing anything destructive
 * and by the test tooling before truncating tables.
 */

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
  "host.docker.internal",
])

export function isLocalDatabaseUrl(url: string | undefined | null): boolean {
  if (!url) return false
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  return LOCAL_HOSTS.has(host.toLowerCase())
}

export function databaseHostForDisplay(url: string | undefined | null): string {
  if (!url) return "<unset>"
  try {
    return new URL(url).hostname
  } catch {
    return "<unparseable>"
  }
}
