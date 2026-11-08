/**
 * Retry helper for GitHub writes that must land, such as the merge-queue
 * check-run post.
 *
 * A required check that is never posted stalls the merge queue, so a single
 * GitHub 5xx or network error must not drop it. Only transient failures are
 * retried: 4xx responses and programming errors fail immediately.
 *
 * Use it only where a duplicate write is harmless. A check run created twice
 * on the same head SHA is fine when both are completed with the same
 * conclusion (GitHub treats the newest run per name as authoritative), but not
 * for an in-progress run that is later updated by id.
 */

export interface TransientRetryOptions {
  /** Total attempts, including the first. */
  attempts?: number
  /** Delay before the first retry; doubles for each later retry. */
  baseDelayMs?: number
  /** Short label for logs, for example "createCheckRun". */
  label?: string
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500

/** Node/undici error codes for a request that never got a response. */
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
])

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const code = (error as { code?: unknown }).code
  if (typeof code === "string") return code
  return errorCode((error as { cause?: unknown }).cause)
}

function isTransientGitHubError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status
    if (typeof status === "number") return status >= 500
  }
  const code = errorCode(error)
  if (code && NETWORK_ERROR_CODES.has(code)) return true
  // undici's fetch reports connection failures as `TypeError: fetch failed`.
  return error instanceof TypeError && error.message === "fetch failed"
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  options: TransientRetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= attempts || !isTransientGitHubError(error)) throw error
      const delayMs = baseDelayMs * 2 ** (attempt - 1)
      console.warn(
        `[github] ${options.label ?? "request"} attempt ${attempt} failed; retrying in ${delayMs}ms:`,
        error instanceof Error ? error.message : error
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
