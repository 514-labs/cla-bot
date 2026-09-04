/**
 * Post-authentication redirect hardening.
 *
 * A `returnTo` value arrives from the query string, from a GitHub App `state`
 * echo, or from our own state cookie, and eventually feeds
 * `NextResponse.redirect(new URL(returnTo, request.url))`. Only a same-origin
 * relative path may ever come out of this helper.
 *
 * Checking `startsWith("/") && !startsWith("//")` is not enough: the WHATWG URL
 * parser treats `\` as `/` and strips tab / CR / LF before parsing, so
 * `/\evil.com`, `/\/evil.com` and `/%0A/evil.com` all resolve to
 * `https://evil.com/`. We reject those byte patterns outright, then parse
 * against a sentinel origin and confirm the result stayed on it, returning the
 * re-serialized path rather than the raw input.
 */

const SENTINEL_ORIGIN = "http://relative.invalid"

/** Backslash, any whitespace, and ASCII control characters (incl. DEL). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters that the URL parser would silently strip is the whole point of this check
const FORBIDDEN_CHARS = /[\\\s\x00-\x1f\x7f]/

/**
 * Return `raw` as a normalized same-origin path (`pathname + search + hash`),
 * or `fallback` when it is empty, absolute, protocol-relative, or contains any
 * character the URL parser would silently rewrite.
 */
export function sanitizeReturnTo(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
  if (FORBIDDEN_CHARS.test(raw)) return fallback

  let url: URL
  try {
    url = new URL(raw, SENTINEL_ORIGIN)
  } catch {
    return fallback
  }
  if (url.origin !== SENTINEL_ORIGIN) return fallback

  // Dot-segment collapsing can turn an input that passed the checks above into a
  // protocol-relative path: `/a/..//evil.com` re-serializes to `//evil.com`,
  // which the caller's `new URL(path, request.url)` would send off-origin.
  // Resolve the output the same way the caller will and require it to stay put.
  const path = `${url.pathname}${url.search}${url.hash}`
  if (new URL(path, SENTINEL_ORIGIN).origin !== SENTINEL_ORIGIN) return fallback

  return path
}
