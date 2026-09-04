import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/db/queries", () => ({
  getOrganizationBySlug: vi.fn(),
  backfillOrganizationGithubAccountId: vi.fn(),
}))

vi.mock("@/lib/github/admin-authorization", () => ({
  verifyGitHubInstallationAccountAdmin: vi.fn(),
}))

import { authorizeOrgAccess } from "@/lib/server/org-access"
import { getSessionUser } from "@/lib/auth"
import { backfillOrganizationGithubAccountId, getOrganizationBySlug } from "@/lib/db/queries"
import { verifyGitHubInstallationAccountAdmin } from "@/lib/github/admin-authorization"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

const mockOrg = {
  id: "org_1",
  githubOrgSlug: "fiveonefour",
  adminUserId: "user_1",
  installationId: 12001,
  githubAccountId: "2001",
}

const mockUser = {
  id: "user_1",
  githubUsername: "orgadmin",
  role: "admin",
}

function mockOrgLookup(org: unknown) {
  vi.mocked(getOrganizationBySlug).mockResolvedValue(
    org as Awaited<ReturnType<typeof getOrganizationBySlug>>
  )
}

function mockSession(user: unknown) {
  vi.mocked(getSessionUser).mockResolvedValue(user as Awaited<ReturnType<typeof getSessionUser>>)
}

describe("authorizeOrgAccess", () => {
  it("returns 404 when org not found", async () => {
    mockOrgLookup(null)

    const result = await authorizeOrgAccess("unknown")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.message).toBe("Organization not found")
    }
  })

  it("returns 404 for a row without an installation before touching the session", async () => {
    mockOrgLookup({ ...mockOrg, installationId: null })
    mockSession(mockUser)
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: true,
      verifiedAccountId: "2001",
    })

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.message).toBe("Organization is not installed")
    }
    expect(getSessionUser).not.toHaveBeenCalled()
    expect(verifyGitHubInstallationAccountAdmin).not.toHaveBeenCalled()
  })

  it("returns 401 when user not authenticated", async () => {
    mockOrgLookup(mockOrg)
    mockSession(null)

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it("returns success when user is GitHub admin", async () => {
    mockOrgLookup(mockOrg)
    mockSession(mockUser)
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: true,
      verifiedAccountId: "2001",
    })

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.org).toBe(mockOrg)
      expect(result.user).toBe(mockUser)
    }
    expect(backfillOrganizationGithubAccountId).not.toHaveBeenCalled()
  })

  it("backfills the account id on a legacy row once identity is verified", async () => {
    const legacyOrg = { ...mockOrg, githubAccountId: null }
    const backfilled = { ...mockOrg, githubAccountId: "2001" }
    mockOrgLookup(legacyOrg)
    mockSession(mockUser)
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: true,
      verifiedAccountId: "2001",
    })
    vi.mocked(backfillOrganizationGithubAccountId).mockResolvedValue(
      backfilled as Awaited<ReturnType<typeof backfillOrganizationGithubAccountId>>
    )

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.org).toBe(backfilled)
    }
    expect(backfillOrganizationGithubAccountId).toHaveBeenCalledWith("org_1", "2001")
  })

  it("does not backfill when the check produced no verified id", async () => {
    vi.stubEnv("NODE_ENV", "development")
    mockOrgLookup({ ...mockOrg, githubAccountId: null })
    mockSession(mockUser)
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: false,
      verifiedAccountId: null,
    })

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(true)
    expect(backfillOrganizationGithubAccountId).not.toHaveBeenCalled()
  })

  it("returns 403 when user is not admin in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockOrgLookup(mockOrg)
    mockSession({ ...mockUser, id: "user_other" })
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: false,
      verifiedAccountId: null,
    })

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it("allows DB admin fallback in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    mockOrgLookup(mockOrg)
    mockSession(mockUser)
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: false,
      verifiedAccountId: null,
    })

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(true)
  })

  it("returns 403 in non-production when not DB admin either", async () => {
    vi.stubEnv("NODE_ENV", "development")
    mockOrgLookup(mockOrg)
    mockSession({ ...mockUser, id: "user_other" })
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockResolvedValue({
      isAdmin: false,
      verifiedAccountId: null,
    })

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it("returns 502 when GitHub admin check throws", async () => {
    mockOrgLookup(mockOrg)
    mockSession(mockUser)
    vi.mocked(verifyGitHubInstallationAccountAdmin).mockRejectedValue(new Error("GitHub API error"))

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(502)
      expect(result.message).toContain("Failed to verify")
    }
  })
})
