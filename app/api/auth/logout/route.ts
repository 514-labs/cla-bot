import { NextRequest, NextResponse } from "next/server"
import { COOKIE_NAME, getSessionCookieOptions, verifySessionToken } from "@/lib/auth"
import { revokeUserGithubTokens } from "@/lib/github/user-token"
import { createAuditEvent } from "@/lib/db/queries"

/**
 * POST /api/auth/logout
 * Revokes the GitHub user access token (best-effort), clears the encrypted
 * token columns, then clears the session cookie and redirects home.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const payload = token ? await verifySessionToken(token) : null

  if (payload?.userId) {
    // Fire-and-forget upstream revoke + DB clear. Don't block logout on it.
    void revokeUserGithubTokens(payload.userId).catch((error) => {
      console.warn("[logout] Token revocation failed", error)
    })
    void createAuditEvent({
      eventType: "user.signed_out",
      userId: payload.userId,
      actorGithubUsername: payload.githubUsername ?? null,
    }).catch((error) => {
      console.warn("[logout] Failed to write audit event", error)
    })
  }

  const response = NextResponse.redirect(new URL("/", request.url))
  const cookieOpts = getSessionCookieOptions()
  response.cookies.set(cookieOpts.name, "", {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0,
  })
  return response
}
