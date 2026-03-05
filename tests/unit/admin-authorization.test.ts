import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: vi.fn((encrypted: string | null | undefined) =>
    encrypted === "enc-token" ? "oauth-token" : null
  ),
}))

const mockPaginate = vi.fn()

vi.mock("@octokit/rest", () => {
  return {
    Octokit: class {
      orgs = {
        getMembershipForAuthenticatedUser: vi.fn(),
        listMembershipsForAuthenticatedUser: vi.fn(),
      }
      paginate = mockPaginate
    },
  }
})

import {
  filterInstalledOrganizationsForAdmin,
  isGitHubInstallationAccountAdmin,
} from "@/lib/github/admin-authorization"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("admin authorization", () => {
  it("authorizes a personal-account installation for the account owner", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const allowed = await isGitHubInstallationAccountAdmin(
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
      },
      {
        adminUserId: "user_2",
        githubOrgSlug: "orgadmin",
        githubAccountType: "user",
        githubAccountId: "1001",
        installationId: 12001,
      }
    )

    expect(allowed).toBe(true)
  })

  it("filters org installs via GitHub admin membership and preserves personal-account owner access", async () => {
    vi.stubEnv("NODE_ENV", "production")
    mockPaginate.mockResolvedValue([
      { role: "admin", organization: { id: 2001, login: "fiveonefour" } },
    ])

    const authorized = await filterInstalledOrganizationsForAdmin(
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
        githubAccessTokenEncrypted: "enc-token",
      },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "orgadmin",
          githubAccountType: "user",
          githubAccountId: "1001",
          installationId: 12001,
        },
        {
          adminUserId: "user_2",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: 12002,
        },
      ]
    )

    expect(authorized).toHaveLength(2)
    expect(authorized.map((org) => org.githubOrgSlug).sort()).toEqual(["fiveonefour", "orgadmin"])
  })

  it("does not authorize a personal-account installation for non-owners", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const authorized = await filterInstalledOrganizationsForAdmin(
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
      },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "callicles",
          githubAccountType: "user",
          githubAccountId: "4429209",
          installationId: 12003,
        },
      ]
    )

    expect(authorized).toHaveLength(0)
  })
})
