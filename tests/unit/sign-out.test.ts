import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// `server-only` throws on import outside a server component; substitute a
// no-op so the modules under test can be loaded in Vitest.
vi.mock("server-only", () => ({}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // Mirror Next's behaviour: redirect() throws to abort the action.
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock("@/lib/db/queries", () => ({
  getUserById: vi.fn(),
  createAuditEvent: vi.fn(),
}))

vi.mock("@/lib/github/user-token", () => ({
  revokeUserGithubTokens: vi.fn(),
}))

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { signOutAction } from "@/app/actions/auth"
import { POST as logoutRoute } from "@/app/api/auth/logout/route"
import { COOKIE_NAME, createSessionToken, type SessionPayload } from "@/lib/auth"
import { createAuditEvent } from "@/lib/db/queries"
import { revokeUserGithubTokens } from "@/lib/github/user-token"
import { signOutUser } from "@/lib/server/sign-out"

const TEST_SECRET = "test-session-secret-that-is-long-enough"

const session: SessionPayload = {
  userId: "user_1",
  githubUsername: "orgadmin",
  role: "admin",
  jti: "sign-out-jti",
}

function mockCookieStore(token: string | null) {
  const set = vi.fn()
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) =>
      token && name === COOKIE_NAME ? { name, value: token } : undefined
    ),
    set,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
  return { set }
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SECRET)
  vi.mocked(revokeUserGithubTokens).mockReset().mockResolvedValue(undefined)
  vi.mocked(createAuditEvent).mockReset().mockResolvedValue(null)
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("signOutUser", () => {
  it("revokes GitHub tokens and writes a user.signed_out audit event", async () => {
    await signOutUser("user_1", "orgadmin")

    expect(revokeUserGithubTokens).toHaveBeenCalledTimes(1)
    expect(revokeUserGithubTokens).toHaveBeenCalledWith("user_1")
    expect(createAuditEvent).toHaveBeenCalledTimes(1)
    expect(createAuditEvent).toHaveBeenCalledWith({
      eventType: "user.signed_out",
      userId: "user_1",
      actorGithubUsername: "orgadmin",
    })
  })

  it("still writes the audit event and resolves when revocation throws", async () => {
    vi.mocked(revokeUserGithubTokens).mockRejectedValue(new Error("github down"))

    await expect(signOutUser("user_1", "orgadmin")).resolves.toBeUndefined()
    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "user.signed_out", userId: "user_1" })
    )
    expect(console.warn).toHaveBeenCalledWith(
      "[sign-out] Token revocation failed",
      expect.any(Error)
    )
  })

  it("resolves when the audit write throws", async () => {
    vi.mocked(createAuditEvent).mockRejectedValue(new Error("db down"))

    await expect(signOutUser("user_1", null)).resolves.toBeUndefined()
    expect(revokeUserGithubTokens).toHaveBeenCalledWith("user_1")
  })
})

describe("signOutAction (server action wired to the header)", () => {
  it("revokes tokens and writes the audit event for the session user, then clears the cookie", async () => {
    const token = await createSessionToken(session)
    const { set } = mockCookieStore(token)

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/")

    expect(revokeUserGithubTokens).toHaveBeenCalledWith("user_1")
    expect(createAuditEvent).toHaveBeenCalledWith({
      eventType: "user.signed_out",
      userId: "user_1",
      actorGithubUsername: "orgadmin",
    })
    expect(set).toHaveBeenCalledWith(COOKIE_NAME, "", expect.objectContaining({ maxAge: 0 }))
    expect(redirect).toHaveBeenCalledWith("/")

    // Revocation must complete before the cookie is cleared, not fire-and-forget.
    const revokeOrder = vi.mocked(revokeUserGithubTokens).mock.invocationCallOrder[0]
    const cookieOrder = set.mock.invocationCallOrder[0]
    expect(revokeOrder).toBeLessThan(cookieOrder)
  })

  it("still clears the cookie and redirects when revocation throws", async () => {
    vi.mocked(revokeUserGithubTokens).mockRejectedValue(new Error("github down"))
    const token = await createSessionToken(session)
    const { set } = mockCookieStore(token)

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/")

    expect(set).toHaveBeenCalledWith(COOKIE_NAME, "", expect.objectContaining({ maxAge: 0 }))
    expect(redirect).toHaveBeenCalledWith("/")
  })

  it("skips revocation and audit when there is no valid session, but still clears the cookie", async () => {
    const { set } = mockCookieStore("not-a-valid-jwt")

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/")

    expect(revokeUserGithubTokens).not.toHaveBeenCalled()
    expect(createAuditEvent).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(COOKIE_NAME, "", expect.objectContaining({ maxAge: 0 }))
  })
})

describe("POST /api/auth/logout", () => {
  it("revokes tokens, writes the audit event, clears the cookie, and redirects home", async () => {
    const token = await createSessionToken(session)
    const request = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    })

    const response = await logoutRoute(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("http://localhost/")
    expect(response.cookies.get(COOKIE_NAME)?.value).toBe("")
    expect(response.cookies.get(COOKIE_NAME)?.maxAge).toBe(0)
    expect(revokeUserGithubTokens).toHaveBeenCalledWith("user_1")
    expect(createAuditEvent).toHaveBeenCalledWith({
      eventType: "user.signed_out",
      userId: "user_1",
      actorGithubUsername: "orgadmin",
    })
  })

  it("still signs out when revocation throws", async () => {
    vi.mocked(revokeUserGithubTokens).mockRejectedValue(new Error("github down"))
    const token = await createSessionToken(session)
    const request = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    })

    const response = await logoutRoute(request)

    expect(response.status).toBe(307)
    expect(response.cookies.get(COOKIE_NAME)?.maxAge).toBe(0)
  })
})
