import { createAuditEvent } from "@/lib/db/queries"
import { revokeUserGithubTokens } from "@/lib/github/user-token"

/**
 * Server-side teardown shared by every sign-out path (the header's server
 * action and `POST /api/auth/logout`).
 *
 * Revokes the user's GitHub App grant and clears the encrypted token columns,
 * then records a `user.signed_out` audit event. Both steps are best-effort:
 * failures are logged and never surfaced, so the caller can always go on to
 * clear the session cookie. Callers should `await` this so the work finishes
 * inside the request instead of being cut off when the response is sent.
 */
export async function signOutUser(userId: string, githubUsername: string | null): Promise<void> {
  const [revocation, audit] = await Promise.allSettled([
    revokeUserGithubTokens(userId),
    createAuditEvent({
      eventType: "user.signed_out",
      userId,
      actorGithubUsername: githubUsername,
    }),
  ])

  if (revocation.status === "rejected") {
    console.warn("[sign-out] Token revocation failed", revocation.reason)
  }
  if (audit.status === "rejected") {
    console.warn("[sign-out] Failed to write audit event", audit.reason)
  }
}
