import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("@/lib/db/queries", () => ({
  getUserById: vi.fn(),
}))

import {
  createSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  getSessionPayload,
  getSessionUser,
  type SessionPayload,
} from "@/lib/auth"
import { cookies } from "next/headers"
import { getUserById } from "@/lib/db/queries"

const TEST_SECRET = "test-session-secret-that-is-long-enough"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("createSessionToken / verifySessionToken round-trip", () => {
  const payload: SessionPayload = {
    userId: "user_1",
    githubUsername: "orgadmin",
    role: "admin",
    jti: "test-jti-123",
  }

  it("creates and verifies a JWT token", async () => {
    const token = await createSessionToken(payload)
    expect(token).toBeTruthy()
    expect(typeof token).toBe("string")

    const verified = await verifySessionToken(token)
    expect(verified).not.toBeNull()
    expect(verified!.userId).toBe("user_1")
    expect(verified!.githubUsername).toBe("orgadmin")
    expect(verified!.role).toBe("admin")
    expect(verified!.jti).toBe("test-jti-123")
  })
})

describe("createSessionToken", () => {
  it("throws when SESSION_SECRET is not set", async () => {
    delete process.env.SESSION_SECRET
    await expect(
      createSessionToken({
        userId: "user_1",
        githubUsername: "orgadmin",
        role: "admin",
        jti: "jti",
      })
    ).rejects.toThrow("SESSION_SECRET is not set")
  })
})

describe("verifySessionToken", () => {
  it("returns null when SESSION_SECRET is not set", async () => {
    delete process.env.SESSION_SECRET
    const result = await verifySessionToken("some-token")
    expect(result).toBeNull()
  })

  it("returns null for invalid/tampered token", async () => {
    const result = await verifySessionToken("invalid.token.here")
    expect(result).toBeNull()
  })

  it("returns null for token signed with different secret", async () => {
    const token = await createSessionToken({
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
      jti: "jti",
    })

    vi.stubEnv("SESSION_SECRET", "completely-different-secret-key-value")
    const result = await verifySessionToken(token)
    expect(result).toBeNull()
  })
})

describe("getSessionCookieOptions", () => {
  it("returns correct cookie options in development", () => {
    vi.stubEnv("NODE_ENV", "development")
    const options = getSessionCookieOptions()
    expect(options.name).toBe("cla-session")
    expect(options.httpOnly).toBe(true)
    expect(options.secure).toBe(false)
    expect(options.sameSite).toBe("lax")
    expect(options.path).toBe("/")
    expect(options.maxAge).toBe(60 * 60 * 24 * 30)
  })

  it("sets secure flag in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const options = getSessionCookieOptions()
    expect(options.secure).toBe(true)
  })
})

describe("getSessionPayload", () => {
  it("returns null when no SESSION_SECRET", async () => {
    delete process.env.SESSION_SECRET
    const result = await getSessionPayload()
    expect(result).toBeNull()
  })

  it("returns null when no cookie is present", async () => {
    const mockCookieStore = { get: vi.fn().mockReturnValue(undefined) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const result = await getSessionPayload()
    expect(result).toBeNull()
  })

  it("returns payload from valid cookie token", async () => {
    const payload: SessionPayload = {
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
      jti: "test-jti",
    }
    const token = await createSessionToken(payload)

    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: token }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const result = await getSessionPayload()
    expect(result).not.toBeNull()
    expect(result!.userId).toBe("user_1")
  })
})

describe("getSessionUser", () => {
  it("returns null when no session payload", async () => {
    delete process.env.SESSION_SECRET
    const result = await getSessionUser()
    expect(result).toBeNull()
  })

  it("returns user with sessionJti when DB lookup succeeds", async () => {
    const payload: SessionPayload = {
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
      jti: "test-jti",
    }
    const token = await createSessionToken(payload)

    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: token }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    const mockUser = {
      id: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
      avatarUrl: "https://example.com/avatar.png",
    }
    vi.mocked(getUserById).mockResolvedValue(mockUser as any)

    const result = await getSessionUser()
    expect(result).not.toBeNull()
    expect(result!.id).toBe("user_1")
    expect(result!.sessionJti).toBe("test-jti")
  })

  it("returns null when DB user not found", async () => {
    const payload: SessionPayload = {
      userId: "nonexistent",
      githubUsername: "ghost",
      role: "admin",
      jti: "test-jti",
    }
    const token = await createSessionToken(payload)

    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: token }) }
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)

    vi.mocked(getUserById).mockResolvedValue(null as any)

    const result = await getSessionUser()
    expect(result).toBeNull()
  })
})
