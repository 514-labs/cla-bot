/**
 * Retry helper for GitHub writes that must land, such as check-run posts.
 *
 * A required check that is never posted stalls the merge queue, so a single
 * GitHub 5xx or network error must not drop it. Only transient failures are
 * retried: 4xx responses (validation, auth, not found) fail immediately.
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

function isTransientGitHubError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status
    if (typeof status === "number") return status >= 500
  }
  // No HTTP status: the request never got a response (network error, reset).
  return true
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
