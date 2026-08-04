/**
 * Log-injection hardening.
 *
 * Values that reach us from a webhook payload, a request header, or the message
 * of an error raised by an upstream call made with such values can contain CR /
 * LF or other ASCII control characters. Writing one verbatim into a log line
 * lets an attacker forge extra log entries or corrupt log parsing, so every
 * user-derived value must pass through `sanitizeForLog` before it is logged.
 */

/** Coerce any value to a loggable string without ever throwing. */
function toLoggableString(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  // Errors: keep the useful part, drop the multi-line stack.
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return String(value)
  } catch {
    // Exotic values (e.g. a throwing `toString`) must not break logging.
    return "[unloggable value]"
  }
}

/**
 * Return a single-line representation of `value` with CR/LF and every other
 * ASCII control character replaced by a space.
 */
export function sanitizeForLog(value: unknown): string {
  return (
    toLoggableString(value)
      // Newlines are what make log forging possible; strip them first.
      .replace(/[\r\n]+/g, " ")
      // Then the remaining control characters (NUL, ESC, backspace, DEL, ...).
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters in order to strip them is the whole point of this helper
      .replace(/[\x00-\x1f\x7f]+/g, " ")
  )
}

/**
 * `sanitizeForLog` for optional fields: preserves an absent value as `null`
 * instead of turning it into the string "null"/"undefined".
 */
export function sanitizeForLogOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return sanitizeForLog(value)
}
