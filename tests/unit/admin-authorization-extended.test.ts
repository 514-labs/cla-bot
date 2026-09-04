import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockGetMembershipForAuthenticatedUser = vi.fn()
const mockListMembershipsForAuthenticatedUser = vi.fn()
const mockOrgsGet = vi.fn()
const mockPaginate = vi.fn()

vi.mock("@octokit/rest", () => {
  return {
    Octokit: class MockOctokit {
      rest = {
        orgs: {
          getMembershipForAuthenticatedUser: mockGetMembershipForAuthenticatedUser,
          listMembershipsForAuthenticatedUser: mockListMembershipsForAuthenticatedUser,
          get: mockOrgsGet,
        },
      }
      paginate = mockPaginate
    },
  }
})

let mockTokenForUser1: string | null = null

vi.mock("@/lib/github/user-token", () => ({
  getValidUserAccessToken: vi.fn(async (userId: string) =>
    userId === "user_1" ? mockTokenForUser1 : null
  ),
}))

import {
  isGitHubOrgAdmin,
  isGitHubInstallationAccountAdmin,
  filterInstalledOrganizationsForAdmin,
  verifyGitHubInstallationAccountAdmin,
} from "@/lib/github/admin-authorization"

beforeEach(() => {
  mockTokenForUser1 = null
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("isGitHubOrgAdmin", () => {
  it("returns false when no access token", async () => {
    const result = await isGitHubOrgAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      "fiveonefour"
    )
    expect(result).toBe(false)
  })

  it("returns false on 404 response", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 })
    )

    const result = await isGitHubOrgAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      "fiveonefour"
    )
    expect(result).toBe(false)
  })

  it("returns false on 403 response", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 })
    )

    const result = await isGitHubOrgAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      "fiveonefour"
    )
    expect(result).toBe(false)
  })

  it("returns true for active admin", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "admin" },
    })

    const result = await isGitHubOrgAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      "fiveonefour"
    )
    expect(result).toBe(true)
  })

  it("returns false for member (non-admin)", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "member" },
    })

    const result = await isGitHubOrgAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      "fiveonefour"
    )
    expect(result).toBe(false)
  })

  it("throws on non-OK non-404 response", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockRejectedValue(
      Object.assign(new Error("Server Error"), { status: 500 })
    )

    await expect(
      isGitHubOrgAdmin(
        { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
        "fiveonefour"
      )
    ).rejects.toThrow("Server Error")
  })
})

describe("isGitHubInstallationAccountAdmin", () => {
  it("checks personal account ownership for user-type installs", async () => {
    const result = await isGitHubInstallationAccountAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      {
        adminUserId: "user_2",
        githubOrgSlug: "orgadmin",
        githubAccountType: "user",
        githubAccountId: "1001",
        installationId: 12001,
      }
    )
    expect(result).toBe(true)
  })

  it("returns false for user-type install when IDs don't match and no username match", async () => {
    const result = await isGitHubInstallationAccountAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      {
        adminUserId: "user_2",
        githubOrgSlug: "someone-else",
        githubAccountType: "user",
        githubAccountId: "9999",
        installationId: 12001,
      }
    )
    expect(result).toBe(false)
  })

  it("checks username match when no account ID for user-type install", async () => {
    const result = await isGitHubInstallationAccountAdmin(
      { id: "user_1", githubUsername: "orgadmin" },
      {
        adminUserId: "user_2",
        githubOrgSlug: "OrgAdmin",
        githubAccountType: "user",
        githubAccountId: null,
        installationId: 12001,
      }
    )
    expect(result).toBe(true)
  })

  it("returns false for user type when username doesn't exist", async () => {
    const result = await isGitHubInstallationAccountAdmin(
      { id: "user_1" },
      {
        adminUserId: "user_2",
        githubOrgSlug: "OrgAdmin",
        githubAccountType: "user",
        githubAccountId: null,
        installationId: 12001,
      }
    )
    expect(result).toBe(false)
  })
})

describe("verifyGitHubInstallationAccountAdmin - organization identity", () => {
  const user = { id: "user_1", githubId: "1001", githubUsername: "orgadmin" }
  const orgRow = {
    adminUserId: "user_2",
    githubOrgSlug: "fiveonefour",
    githubAccountType: "organization",
    githubAccountId: "2001",
    installationId: 12002,
  }

  it("authorizes an org admin when the live org id matches the stored account id", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "admin" },
    })
    mockOrgsGet.mockResolvedValue({ data: { id: 2001, login: "fiveonefour" } })

    const result = await verifyGitHubInstallationAccountAdmin(user, orgRow)

    expect(result).toEqual({ isAdmin: true, verifiedAccountId: "2001" })
    expect(mockOrgsGet).toHaveBeenCalledWith({ org: "fiveonefour" })
    expect(await isGitHubInstallationAccountAdmin(user, orgRow)).toBe(true)
  })

  it("fails closed when the org behind the slug is a different GitHub account", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockTokenForUser1 = "oauth-token"
    // The user really is an admin of the org currently named `fiveonefour`...
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "admin" },
    })
    // ...but that org is a new registration of a freed login, not the one on record.
    mockOrgsGet.mockResolvedValue({ data: { id: 999999, login: "fiveonefour" } })

    const result = await verifyGitHubInstallationAccountAdmin(user, orgRow)

    expect(result).toEqual({ isAdmin: false, verifiedAccountId: null })
    expect(await isGitHubInstallationAccountAdmin(user, orgRow)).toBe(false)
  })

  it("accepts a legacy row with no stored account id and reports the live id for backfill", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "admin" },
    })
    mockOrgsGet.mockResolvedValue({ data: { id: 2001, login: "fiveonefour" } })

    const result = await verifyGitHubInstallationAccountAdmin(user, {
      ...orgRow,
      githubAccountId: null,
    })

    expect(result).toEqual({ isAdmin: true, verifiedAccountId: "2001" })
  })

  it("does not fetch the org when the membership check already fails", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "member" },
    })

    const result = await verifyGitHubInstallationAccountAdmin(user, orgRow)

    expect(result).toEqual({ isAdmin: false, verifiedAccountId: null })
    expect(mockOrgsGet).not.toHaveBeenCalled()
  })

  it("propagates GitHub errors from the org lookup so callers fail closed with 502", async () => {
    mockTokenForUser1 = "oauth-token"
    mockGetMembershipForAuthenticatedUser.mockResolvedValue({
      data: { state: "active", role: "admin" },
    })
    mockOrgsGet.mockRejectedValue(Object.assign(new Error("Server Error"), { status: 500 }))

    await expect(verifyGitHubInstallationAccountAdmin(user, orgRow)).rejects.toThrow("Server Error")
  })

  it("reports the signed-in user's id for a personal-account owner", async () => {
    const result = await verifyGitHubInstallationAccountAdmin(user, {
      adminUserId: "user_2",
      githubOrgSlug: "orgadmin",
      githubAccountType: "user",
      githubAccountId: null,
      installationId: 12001,
    })

    expect(result).toEqual({ isAdmin: true, verifiedAccountId: "1001" })
  })
})

describe("filterInstalledOrganizationsForAdmin - additional coverage", () => {
  it("returns empty array when all orgs have null installationId", async () => {
    const result = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: null,
        },
      ]
    )
    expect(result).toHaveLength(0)
  })

  it("falls back to DB admin mapping in non-production without token", async () => {
    vi.stubEnv("NODE_ENV", "development")

    const result = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_1",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: 12001,
        },
      ]
    )
    expect(result).toHaveLength(1)
    expect(result[0].githubOrgSlug).toBe("fiveonefour")
  })

  it("denies org access in production without token", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const result = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_1",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: 12001,
        },
      ]
    )
    expect(result).toHaveLength(0)
  })

  it("treats failed org-admin checks as non-admin instead of throwing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockTokenForUser1 = "oauth-token"
    mockPaginate.mockRejectedValue(new Error("Network error"))

    const result = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: 12001,
        },
      ]
    )
    expect(result).toHaveLength(0)
  })

  it("filters to only orgs where user has admin membership", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockTokenForUser1 = "oauth-token"
    mockPaginate.mockResolvedValue([
      { state: "active", role: "admin", organization: { login: "514-labs", id: 140028474 } },
    ])

    const result = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "ChambreSonore",
          githubAccountType: "organization",
          githubAccountId: "10694701",
          installationId: 112308378,
        },
        {
          adminUserId: "user_2",
          githubOrgSlug: "514-labs",
          githubAccountType: "organization",
          githubAccountId: "140028474",
          installationId: 112316261,
        },
      ]
    )
    expect(result).toHaveLength(1)
    expect(result[0].githubOrgSlug).toBe("514-labs")
  })
})
