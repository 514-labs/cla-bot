import { SignJWT } from "jose"
import { TEST_USERS, type TestRole } from "./fixtures"

const SESSION_SECRET =
  process.env.SESSION_SECRET ?? process.env.TEST_SESSION_SECRET ?? "cla-bot-test-session-secret"
const SECRET_BYTES = new TextEncoder().encode(SESSION_SECRET)

const sessionTokensByRole = new Map<TestRole, string>()

export async function getSessionToken(role: TestRole): Promise<string> {
  const existing = sessionTokensByRole.get(role)
  if (existing) return existing

  const token = await new SignJWT({
    userId: TEST_USERS[role].id,
    githubUsername: TEST_USERS[role].githubUsername,
    role: TEST_USERS[role].role,
    jti: `test-jti-${role}`,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(`test-jti-${role}`)
    .setExpirationTime("30d")
    .sign(SECRET_BYTES)

  sessionTokensByRole.set(role, token)
  return token
}

export async function getSessionCookie(role: TestRole): Promise<string> {
  const token = await getSessionToken(role)
  return `cla-session=${token}`
}

export function clearSessionCookieCache() {
  sessionTokensByRole.clear()
}
