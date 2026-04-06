import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/cla/signing", () => ({
  signClaForUser: vi.fn(),
  SignClaError: class SignClaError extends Error {
    code: string
    status: number
    details?: Record<string, unknown>
    constructor(
      code: string,
      message: string,
      status: number,
      details?: Record<string, unknown>
    ) {
      super(message)
      this.code = code
      this.status = status
      this.details = details
    }
  },
  resolveRequestEvidenceFromHeaders: vi.fn().mockReturnValue({
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  }),
}))

vi.mock("@/lib/cla/signer-pr-sync-scheduler", () => ({
  scheduleSignerPrSyncAfterSign: vi.fn().mockResolvedValue({
    prSyncScheduled: false,
    prSyncRunId: null,
    prSyncScheduleError: null,
    prSyncSkippedReason: "missing_installation_id",
  }),
}))

import { getSessionUser } from "@/lib/auth"
import { signClaForUser } from "@/lib/cla/signing"
import { POST } from "@/app/api/sign/route"

const mockUser = {
  id: "user_1",
  sessionJti: "jti-123",
  githubId: "1001",
  githubUsername: "contributor1",
  name: "Contributor One",
  avatarUrl: "https://example.com/avatar.png",
  email: "contributor@example.com",
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockResolvedValue(mockUser as Awaited<ReturnType<typeof getSessionUser>>)
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeSignRequest(body: unknown): NextRequest {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body)
  return new NextRequest("http://localhost:3000/api/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  })
}

describe("POST /api/sign", () => {
  it("returns 400 for invalid JSON body", async () => {
    const request = new NextRequest("http://localhost:3000/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toBe("Invalid JSON payload")
  })

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const request = makeSignRequest({ orgSlug: "test-org" })
    const response = await POST(request)
    expect(response.status).toBe(401)

    const data = await response.json()
    expect(data.error).toBe("Unauthorized")
  })

  it("calls signClaForUser with correct parameters", async () => {
    const mockSignature = {
      id: "sig_1",
      orgId: "org_1",
      userId: "user_1",
      claSha256: "abc123",
      githubUsername: "contributor1",
    }
    vi.mocked(signClaForUser).mockResolvedValue({
      signature: mockSignature,
      org: {
        id: "org_1",
        orgSlug: "test-org",
        installationId: null,
        claSha256: "abc123",
      },
      prSyncContext: {
        repoName: null,
        prNumber: null,
      },
    } as Awaited<ReturnType<typeof signClaForUser>>)

    const request = makeSignRequest({
      orgSlug: "test-org",
      assented: true,
      acceptedSha256: "abc123",
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.signature).toBeDefined()
    expect(data.signature.id).toBe("sig_1")

    expect(signClaForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        orgSlug: "test-org",
        assented: true,
        acceptedSha256: "abc123",
      })
    )
  })

  it("returns SignClaError details in response", async () => {
    const { SignClaError } = await import("@/lib/cla/signing")
    vi.mocked(signClaForUser).mockRejectedValue(
      new SignClaError("VERSION_MISMATCH", "CLA version mismatch", 409, {
        currentSha256: "newsha",
      })
    )

    const request = makeSignRequest({
      orgSlug: "test-org",
      assented: true,
    })

    const response = await POST(request)
    expect(response.status).toBe(409)

    const data = await response.json()
    expect(data.error).toBe("CLA version mismatch")
    expect(data.currentSha256).toBe("newsha")
  })

  it("returns 500 for unexpected errors", async () => {
    vi.mocked(signClaForUser).mockRejectedValue(new Error("DB connection failed"))

    const request = makeSignRequest({
      orgSlug: "test-org",
      assented: true,
    })

    const response = await POST(request)
    expect(response.status).toBe(500)

    const data = await response.json()
    expect(data.error).toBe("Unexpected server error")
  })

  it("passes repo and PR context to signClaForUser", async () => {
    const mockSignature = {
      id: "sig_1",
      orgId: "org_1",
      userId: "user_1",
      claSha256: "abc123",
      githubUsername: "contributor1",
    }
    vi.mocked(signClaForUser).mockResolvedValue({
      signature: mockSignature,
      org: {
        id: "org_1",
        orgSlug: "test-org",
        installationId: 12001,
        claSha256: "abc123",
      },
      prSyncContext: {
        repoName: "my-repo",
        prNumber: 42,
      },
    } as Awaited<ReturnType<typeof signClaForUser>>)

    const request = makeSignRequest({
      orgSlug: "test-org",
      repoName: "my-repo",
      prNumber: 42,
      assented: true,
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    expect(signClaForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        repoName: "my-repo",
        prNumber: 42,
      })
    )
  })
})
