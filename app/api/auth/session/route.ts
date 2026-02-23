import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { toSessionUserDto } from "@/lib/session-user"

/**
 * GET /api/auth/session
 * Returns the current session user, or { user: null } if not authenticated.
 */
export async function GET() {
  const user = await getSessionUser()
  return NextResponse.json({ user: toSessionUserDto(user) })
}
