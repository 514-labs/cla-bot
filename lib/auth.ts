/**
 * Auth utilities — JWT-based session management.
 *
 * In production:
 *   - GitHub OAuth callback sets a secure HTTP-only cookie with a JWT
 *   - getSession() reads the cookie and verifies the JWT
 *   - The JWT payload contains { userId, githubUsername, role, jti }
 *
 * In dev/test, use a configured SESSION_SECRET to simulate signed-in users.
 */

import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { getUserById } from "./db/queries"

const COOKIE_NAME = "cla-session"

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET
  if (!secret) return null
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  userId: string
  githubUsername: string
  role: string
  jti: string
}

/**
 * Create a signed JWT for the given payload.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secret = getJwtSecret()
  if (!secret) throw new Error("SESSION_SECRET is not set")

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(payload.jti)
    .setExpirationTime("30d")
    .sign(secret)
}

/**
 * Verify and decode a session JWT.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const secret = getJwtSecret()
  if (!secret) return null

  try {
    const { payload } = await jwtVerify(token, secret)
    return {
      userId: payload.userId as string,
      githubUsername: payload.githubUsername as string,
      role: payload.role as string,
      jti: payload.jti as string,
    }
  } catch {
    return null
  }
}

export async function getSessionPayload() {
  const secret = getJwtSecret()
  if (!secret) return null

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  return verifySessionToken(token)
}

/**
 * Get the current session user from the request cookies.
 * Returns the full user record from the DB, or null if not authenticated.
 */
export async function getSessionUser() {
  const payload = await getSessionPayload()
  if (!payload) return null

  // Fetch the full user record from the DB
  const user = await getUserById(payload.userId)
  if (user) {
    return { ...user, sessionJti: payload.jti }
  }

  return null
}

/**
 * Cookie options for the session token.
 */
export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  }
}
