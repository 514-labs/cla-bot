import { NextRequest, NextResponse } from "next/server"
import { COOKIE_NAME, getSessionCookieOptions, verifySessionToken } from "@/lib/auth"
import { signOutUser } from "@/lib/server/sign-out"

/**
 * POST /api/auth/logout
 * HTTP equivalent of the header's `signOutAction`: revokes the GitHub user
 * grant (best-effort), clears the encrypted token columns, writes the audit
 * event, then clears the session cookie and redirects home.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const payload = token ? await verifySessionToken(token) : null

  if (payload?.userId) {
    await signOutUser(payload.userId, payload.githubUsername ?? null)
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
