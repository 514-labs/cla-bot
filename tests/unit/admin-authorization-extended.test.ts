import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: vi.fn((encrypted: string | null | undefined) =>
    encrypted === "enc-token" ? "oauth-token" : null
  ),
}))

const mockGetMembership = vi.fn()
const mockListMemberships = vi.fn()
const mockPaginate = vi.fn()

vi.mock("@octokit/rest", () => {
  return {
    Octokit: class {
      orgs = {
        getMembershipForAuthenticatedUser: mockGetMembership,
        listMembershipsForAuthenticatedUser: mockListMemberships,
      }
      paginate = mockPaginate
    },
  }
})

import {
  isGitHubOrgAdmin,
  isGitHubInstallationAccountAdmin,
  filterInstalledOrganizationsForAdmin,
} from "@/lib/github/admin-authorization"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

const userWithToken = {
  id: "user_1",
  githubId: "1001",
  githubUsername: "orgadmin",
  githubAccessTokenEncrypted: "enc-token",
}

const userWithoutToken = {
  id: "user_1",
  githubId: "1001",
  githubUsername: "orgadmin",
}

describe("isGitHubOrgAdmin", () => {
  it("returns false when no access token", async () => {
    const result = await isGitHubOrgAdmin(userWithoutToken, "fiveonefour")
    expect(result).toBe(false)
  })

  it("returns false on 404 response", async () => {
    mockGetMembership.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }))

    const result = await isGitHubOrgAdmin(userWithToken, "fiveonefour")
    expect(result).toBe(false)
  })

  it("returns false on 403 response", async () => {
    mockGetMembership.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }))

    const result = await isGitHubOrgAdmin(userWithToken, "fiveonefour")
    expect(result).toBe(false)
  })

  it("returns true for active admin", async () => {
    mockGetMembership.mockResolvedValue({ data: { state: "active", role: "admin" } })

    const result = await isGitHubOrgAdmin(userWithToken, "fiveonefour")
    expect(result).toBe(true)
  })

  it("returns false for member (non-admin)", async () => {
    mockGetMembership.mockResolvedValue({ data: { state: "active", role: "member" } })

    const result = await isGitHubOrgAdmin(userWithToken, "fiveonefour")
    expect(result).toBe(false)
  })

  it("throws on non-OK non-404 response", async () => {
    mockGetMembership.mockRejectedValue(Object.assign(new Error("Server Error"), { status: 500 }))

    await expect(isGitHubOrgAdmin(userWithToken, "fiveonefour")).rejects.toThrow("Server Error")
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

describe("filterInstalledOrganizationsForAdmin - additional coverage", () => {
  it("returns empty array when all orgs have null installationId", async () => {
    const result = await filterInstalledOrganizationsForAdmin(userWithoutToken, [
      {
        adminUserId: "user_2",
        githubOrgSlug: "fiveonefour",
        githubAccountType: "organization",
        githubAccountId: "2001",
        installationId: null,
      },
    ])
    expect(result).toHaveLength(0)
  })

  it("falls back to DB admin mapping in non-production without token", async () => {
    vi.stubEnv("NODE_ENV", "development")

    const result = await filterInstalledOrganizationsForAdmin(userWithoutToken, [
      {
        adminUserId: "user_1",
        githubOrgSlug: "fiveonefour",
        githubAccountType: "organization",
        githubAccountId: "2001",
        installationId: 12001,
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].githubOrgSlug).toBe("fiveonefour")
  })

  it("denies org access in production without token", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const result = await filterInstalledOrganizationsForAdmin(userWithoutToken, [
      {
        adminUserId: "user_1",
        githubOrgSlug: "fiveonefour",
        githubAccountType: "organization",
        githubAccountId: "2001",
        installationId: 12001,
      },
    ])
    expect(result).toHaveLength(0)
  })

  it("intersects GitHub admin memberships with DB orgs", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockPaginate.mockResolvedValue([
      { role: "admin", organization: { id: 140028474, login: "514-labs" } },
    ])

    const result = await filterInstalledOrganizationsForAdmin(userWithToken, [
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
    ])
    expect(result).toHaveLength(1)
    expect(result[0].githubOrgSlug).toBe("514-labs")
  })

  it("throws when GitHub membership list API fails", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockPaginate.mockRejectedValue(new Error("Network error"))

    await expect(
      filterInstalledOrganizationsForAdmin(userWithToken, [
        {
          adminUserId: "user_2",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: 12001,
        },
      ])
    ).rejects.toThrow("Network error")
  })

  it("skips GitHub API call when no org-type installs exist", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const result = await filterInstalledOrganizationsForAdmin(userWithToken, [
      {
        adminUserId: "user_2",
        githubOrgSlug: "orgadmin",
        githubAccountType: "user",
        githubAccountId: "1001",
        installationId: 12001,
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].githubOrgSlug).toBe("orgadmin")
    expect(mockPaginate).not.toHaveBeenCalled()
  })
})
