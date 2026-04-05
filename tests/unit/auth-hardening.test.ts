import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SignJWT } from "jose"

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("@/lib/db/queries", () => ({
  getUserById: vi.fn(),
}))

import { createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/auth"

const TEST_SECRET = "test-session-secret-that-is-long-enough"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("JWT expiration handling", () => {
  it("returns null for an expired token", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET)
    const expiredToken = await new SignJWT({
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600) // issued 1 hour ago
      .setJti("expired-jti")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // expired 30 minutes ago
      .sign(secret)

    const result = await verifySessionToken(expiredToken)
    expect(result).toBeNull()
  })

  it("returns null for a token with very short expiry after waiting", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET)
    const shortLivedToken = await new SignJWT({
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setJti("short-lived-jti")
      .setExpirationTime("1s")
      .sign(secret)

    // Token should be valid immediately
    const validResult = await verifySessionToken(shortLivedToken)
    expect(validResult).not.toBeNull()

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const expiredResult = await verifySessionToken(shortLivedToken)
    expect(expiredResult).toBeNull()
  })
})

describe("JWT tampering", () => {
  it("returns null for a token with tampered payload", async () => {
    const token = await createSessionToken({
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
      jti: "test-jti",
    })

    // Tamper with the payload segment (base64url middle part)
    const parts = token.split(".")
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
    payload.role = "superadmin"
    parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const tampered = parts.join(".")

    const result = await verifySessionToken(tampered)
    expect(result).toBeNull()
  })

  it("returns null for a completely malformed token", async () => {
    const result = await verifySessionToken("not-a-jwt-at-all")
    expect(result).toBeNull()
  })

  it("returns null for an empty string token", async () => {
    const result = await verifySessionToken("")
    expect(result).toBeNull()
  })

  it("returns null for a token with only header and payload (no signature)", async () => {
    const token = await createSessionToken({
      userId: "user_1",
      githubUsername: "orgadmin",
      role: "admin",
      jti: "test-jti",
    })
    const parts = token.split(".")
    const noSignature = `${parts[0]}.${parts[1]}.`

    const result = await verifySessionToken(noSignature)
    expect(result).toBeNull()
  })
})

describe("JWT secret edge cases", () => {
  it("returns null when SESSION_SECRET is empty string", async () => {
    vi.stubEnv("SESSION_SECRET", "")
    const result = await verifySessionToken("some-token")
    expect(result).toBeNull()
  })

  it("createSessionToken throws when SESSION_SECRET is empty string", async () => {
    vi.stubEnv("SESSION_SECRET", "")
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
