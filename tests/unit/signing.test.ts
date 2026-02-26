import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/queries", () => ({
  getOrganizationBySlug: vi.fn(),
  getSignatureStatus: vi.fn(),
  createSignature: vi.fn(),
  createAuditEvent: vi.fn(),
}))

import {
  signClaForUser,
  SignClaError,
  resolveRequestEvidenceFromHeaders,
  getBaseUrlFromHeaders,
} from "@/lib/cla/signing"
import {
  getOrganizationBySlug,
  getSignatureStatus,
  createSignature,
  createAuditEvent,
} from "@/lib/db/queries"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

const mockOrg = {
  id: "org_1",
  githubOrgSlug: "fiveonefour",
  name: "Fiveonefour",
  isActive: true,
  claText: "# CLA\nContributor License Agreement text.",
  claTextSha256: "abc1234567890",
  installationId: 12001,
  githubAccountType: "organization",
}

const mockUser = {
  id: "user_1",
  sessionJti: "jti-123",
  githubId: "1001",
  githubUsername: "contributor1",
  name: "Contributor One",
  avatarUrl: "https://example.com/avatar.png",
  email: "contributor@example.com",
  emailVerified: true,
  emailSource: "github",
}

describe("signClaForUser", () => {
  it("throws BAD_REQUEST when orgSlug is empty", async () => {
    await expect(signClaForUser({ orgSlug: "", user: mockUser })).rejects.toThrow(SignClaError)

    try {
      await signClaForUser({ orgSlug: "", user: mockUser })
    } catch (e) {
      expect(e).toBeInstanceOf(SignClaError)
      expect((e as SignClaError).code).toBe("BAD_REQUEST")
      expect((e as SignClaError).status).toBe(400)
    }
  })

  it("throws UNAUTHORIZED when user is invalid", async () => {
    await expect(
      signClaForUser({
        orgSlug: "fiveonefour",
        user: {} as unknown as Parameters<typeof signClaForUser>[0]["user"],
      })
    ).rejects.toThrow(SignClaError)

    try {
      await signClaForUser({
        orgSlug: "fiveonefour",
        user: { id: "", githubUsername: "" } as unknown as Parameters<
          typeof signClaForUser
        >[0]["user"],
      })
    } catch (e) {
      expect((e as SignClaError).code).toBe("UNAUTHORIZED")
    }
  })

  it("throws BAD_REQUEST when assented is false", async () => {
    try {
      await signClaForUser({ orgSlug: "fiveonefour", user: mockUser, assented: false })
    } catch (e) {
      expect((e as SignClaError).code).toBe("BAD_REQUEST")
      expect((e as SignClaError).message).toContain("Explicit assent")
    }
  })

  it("throws BAD_REQUEST when repoName is provided without prNumber", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({ signed: false, currentVersion: false })

    try {
      await signClaForUser({
        orgSlug: "fiveonefour",
        user: mockUser,
        repoName: "sdk",
        prNumber: null,
      })
    } catch (e) {
      expect((e as SignClaError).code).toBe("BAD_REQUEST")
      expect((e as SignClaError).message).toContain(
        "repoName and prNumber must be provided together"
      )
    }
  })

  it("throws NOT_FOUND when org does not exist", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )

    try {
      await signClaForUser({ orgSlug: "unknown", user: mockUser })
    } catch (e) {
      expect((e as SignClaError).code).toBe("NOT_FOUND")
      expect((e as SignClaError).status).toBe(404)
    }
  })

  it("throws FORBIDDEN when org is not active", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue({
      ...mockOrg,
      isActive: false,
    } as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>)

    try {
      await signClaForUser({ orgSlug: "fiveonefour", user: mockUser })
    } catch (e) {
      expect((e as SignClaError).code).toBe("FORBIDDEN")
      expect((e as SignClaError).status).toBe(403)
    }
  })

  it("throws BAD_REQUEST when no CLA configured", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue({
      ...mockOrg,
      claTextSha256: null,
    } as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>)

    try {
      await signClaForUser({ orgSlug: "fiveonefour", user: mockUser })
    } catch (e) {
      expect((e as SignClaError).code).toBe("BAD_REQUEST")
      expect((e as SignClaError).message).toContain("No CLA configured")
    }
  })

  it("throws VERSION_MISMATCH when acceptedSha256 doesn't match", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )

    try {
      await signClaForUser({
        orgSlug: "fiveonefour",
        user: mockUser,
        acceptedSha256: "wronghash",
      })
    } catch (e) {
      expect((e as SignClaError).code).toBe("VERSION_MISMATCH")
      expect((e as SignClaError).status).toBe(409)
      expect((e as SignClaError).details?.currentSha256).toBe(mockOrg.claTextSha256)
    }
  })

  it("throws ALREADY_SIGNED when user already signed current version", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({
      signed: true,
      currentVersion: true,
      signature: { id: "sig_1" },
    } as unknown as Awaited<ReturnType<typeof getSignatureStatus>>)

    try {
      await signClaForUser({ orgSlug: "fiveonefour", user: mockUser })
    } catch (e) {
      expect((e as SignClaError).code).toBe("ALREADY_SIGNED")
      expect((e as SignClaError).status).toBe(409)
    }
  })

  it("throws UNAUTHORIZED when sessionJti is missing", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({ signed: false, currentVersion: false })

    try {
      await signClaForUser({
        orgSlug: "fiveonefour",
        user: { ...mockUser, sessionJti: null },
      })
    } catch (e) {
      expect((e as SignClaError).code).toBe("UNAUTHORIZED")
      expect((e as SignClaError).message).toContain("Missing session context")
    }
  })

  it("successfully signs CLA and returns result", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({ signed: false, currentVersion: false })
    const mockSignature = { id: "sig_1", githubUsername: "contributor1" }
    vi.mocked(createSignature).mockResolvedValue(
      mockSignature as unknown as Awaited<ReturnType<typeof createSignature>>
    )
    vi.mocked(createAuditEvent).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createAuditEvent>>
    )

    const result = await signClaForUser({
      orgSlug: "fiveonefour",
      user: mockUser,
      repoName: "sdk",
      prNumber: 42,
      requestEvidence: { ipAddress: "1.2.3.4", userAgent: "test-agent" },
    })

    expect(result.signature).toBe(mockSignature)
    expect(result.org.id).toBe("org_1")
    expect(result.org.orgSlug).toBe("fiveonefour")
    expect(result.org.installationId).toBe(12001)
    expect(result.org.claSha256).toBe(mockOrg.claTextSha256)
    expect(result.prSyncContext.repoName).toBe("sdk")
    expect(result.prSyncContext.prNumber).toBe(42)

    expect(createSignature).toHaveBeenCalled()
    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "signature.created",
        orgId: "org_1",
        userId: "user_1",
      })
    )
  })

  it("uses fallback email when user email is empty", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({ signed: false, currentVersion: false })
    vi.mocked(createSignature).mockResolvedValue({
      id: "sig_1",
      githubUsername: "contributor1",
    } as unknown as Awaited<ReturnType<typeof createSignature>>)
    vi.mocked(createAuditEvent).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createAuditEvent>>
    )

    await signClaForUser({
      orgSlug: "fiveonefour",
      user: { ...mockUser, email: null },
    })

    expect(createSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAtSignature: "contributor1@users.noreply.github.com",
        emailVerifiedAtSignature: false,
        emailSource: "none",
      })
    )
  })

  it("handles string prNumber correctly", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({ signed: false, currentVersion: false })
    vi.mocked(createSignature).mockResolvedValue({
      id: "sig_1",
      githubUsername: "contributor1",
    } as unknown as Awaited<ReturnType<typeof createSignature>>)
    vi.mocked(createAuditEvent).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createAuditEvent>>
    )

    const result = await signClaForUser({
      orgSlug: "fiveonefour",
      user: mockUser,
      repoName: "sdk",
      prNumber: "42",
    })

    expect(result.prSyncContext.prNumber).toBe(42)
  })

  it("uses default consent text version when not provided", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSignatureStatus).mockResolvedValue({ signed: false, currentVersion: false })
    vi.mocked(createSignature).mockResolvedValue({
      id: "sig_1",
      githubUsername: "contributor1",
    } as unknown as Awaited<ReturnType<typeof createSignature>>)
    vi.mocked(createAuditEvent).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createAuditEvent>>
    )

    await signClaForUser({ orgSlug: "fiveonefour", user: mockUser })

    expect(createSignature).toHaveBeenCalledWith(
      expect.objectContaining({ consentTextVersion: "v1" })
    )
  })
})

describe("SignClaError", () => {
  it("has correct code, status, and message", () => {
    const error = new SignClaError("BAD_REQUEST", "Something went wrong", 400)
    expect(error.code).toBe("BAD_REQUEST")
    expect(error.status).toBe(400)
    expect(error.message).toBe("Something went wrong")
    expect(error).toBeInstanceOf(Error)
  })

  it("supports optional details", () => {
    const error = new SignClaError("CONFLICT", "conflict", 409, { key: "value" })
    expect(error.details).toEqual({ key: "value" })
  })
})

describe("resolveRequestEvidenceFromHeaders", () => {
  it("extracts IP from x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "user-agent": "test-agent",
    })
    const evidence = resolveRequestEvidenceFromHeaders(headers)
    expect(evidence.ipAddress).toBe("1.2.3.4")
    expect(evidence.userAgent).toBe("test-agent")
  })

  it("falls back to x-real-ip", () => {
    const headers = new Headers({
      "x-real-ip": "10.0.0.1",
    })
    const evidence = resolveRequestEvidenceFromHeaders(headers)
    expect(evidence.ipAddress).toBe("10.0.0.1")
  })

  it("returns null IP when no headers", () => {
    const headers = new Headers({})
    const evidence = resolveRequestEvidenceFromHeaders(headers)
    expect(evidence.ipAddress).toBeNull()
    expect(evidence.userAgent).toBeNull()
  })
})

describe("getBaseUrlFromHeaders", () => {
  it("returns NEXT_PUBLIC_APP_URL when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cla.example.com")
    const headers = new Headers({})
    expect(getBaseUrlFromHeaders(headers)).toBe("https://cla.example.com")
  })

  it("constructs URL from forwarded headers", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const headers = new Headers({
      "x-forwarded-host": "cla.example.com",
      "x-forwarded-proto": "https",
    })
    expect(getBaseUrlFromHeaders(headers)).toBe("https://cla.example.com")
  })

  it("falls back to host header with default protocol", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const headers = new Headers({
      host: "cla.example.com",
    })
    expect(getBaseUrlFromHeaders(headers)).toBe("https://cla.example.com")
  })

  it("returns default URL when no headers", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const headers = new Headers({})
    expect(getBaseUrlFromHeaders(headers)).toBe("https://cla.fiveonefour.com")
  })
})
