import { NextRequest, NextResponse } from "next/server"
import { getSessionCookieOptions } from "@/lib/auth"

/**
 * POST /api/auth/logout
 * Clears the session cookie and redirects to the home page.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url))
  const cookieOpts = getSessionCookieOptions()
  response.cookies.set(cookieOpts.name, "", {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0, // expire immediately
  })
  return response
}
