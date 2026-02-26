import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/db/queries", () => ({
  getOrganizationBySlug: vi.fn(),
}))

vi.mock("@/lib/github/admin-authorization", () => ({
  isGitHubInstallationAccountAdmin: vi.fn(),
}))

import { authorizeOrgAccess } from "@/lib/server/org-access"
import { getSessionUser } from "@/lib/auth"
import { getOrganizationBySlug } from "@/lib/db/queries"
import { isGitHubInstallationAccountAdmin } from "@/lib/github/admin-authorization"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

const mockOrg = {
  id: "org_1",
  githubOrgSlug: "fiveonefour",
  adminUserId: "user_1",
  installationId: 12001,
}

const mockUser = {
  id: "user_1",
  githubUsername: "orgadmin",
  role: "admin",
}

describe("authorizeOrgAccess", () => {
  it("returns 404 when org not found", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )

    const result = await authorizeOrgAccess("unknown")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.message).toBe("Organization not found")
    }
  })

  it("returns 401 when user not authenticated", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
    }
  })

  it("returns success when user is GitHub admin", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSessionUser).mockResolvedValue(
      mockUser as unknown as Awaited<ReturnType<typeof getSessionUser>>
    )
    vi.mocked(isGitHubInstallationAccountAdmin).mockResolvedValue(true)

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.org).toBe(mockOrg)
      expect(result.user).toBe(mockUser)
    }
  })

  it("returns 403 when user is not admin in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSessionUser).mockResolvedValue({
      ...mockUser,
      id: "user_other",
    } as unknown as Awaited<ReturnType<typeof getSessionUser>>)
    vi.mocked(isGitHubInstallationAccountAdmin).mockResolvedValue(false)

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it("allows DB admin fallback in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSessionUser).mockResolvedValue(
      mockUser as unknown as Awaited<ReturnType<typeof getSessionUser>>
    )
    vi.mocked(isGitHubInstallationAccountAdmin).mockResolvedValue(false)

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(true)
  })

  it("returns 403 in non-production when not DB admin either", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSessionUser).mockResolvedValue({
      ...mockUser,
      id: "user_other",
    } as unknown as Awaited<ReturnType<typeof getSessionUser>>)
    vi.mocked(isGitHubInstallationAccountAdmin).mockResolvedValue(false)

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
    }
  })

  it("returns 502 when GitHub admin check throws", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getSessionUser).mockResolvedValue(
      mockUser as unknown as Awaited<ReturnType<typeof getSessionUser>>
    )
    vi.mocked(isGitHubInstallationAccountAdmin).mockRejectedValue(new Error("GitHub API error"))

    const result = await authorizeOrgAccess("fiveonefour")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(502)
      expect(result.message).toContain("Failed to verify")
    }
  })
})
