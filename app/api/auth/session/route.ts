import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"

/**
 * GET /api/auth/session
 * Returns the current session user, or { user: null } if not authenticated.
 */
export async function GET() {
  const user = await getSessionUser()
  return NextResponse.json({ user: user ?? null })
}
