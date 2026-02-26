import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: vi.fn((encrypted: string | null | undefined) =>
    encrypted === "enc-token" ? "oauth-token" : null
  ),
}))

import {
  isGitHubOrgAdmin,
  isGitHubInstallationAccountAdmin,
  filterInstalledOrganizationsForAdmin,
} from "@/lib/github/admin-authorization"

const originalFetch = global.fetch

afterEach(() => {
  vi.unstubAllEnvs()
  global.fetch = originalFetch
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
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Not Found", { status: 404 })) as typeof global.fetch

    const result = await isGitHubOrgAdmin(
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
        githubAccessTokenEncrypted: "enc-token",
      },
      "fiveonefour"
    )
    expect(result).toBe(false)
  })

  it("returns true for active admin", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ state: "active", role: "admin" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof global.fetch

    const result = await isGitHubOrgAdmin(
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
        githubAccessTokenEncrypted: "enc-token",
      },
      "fiveonefour"
    )
    expect(result).toBe(true)
  })

  it("returns false for member (non-admin)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ state: "active", role: "member" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof global.fetch

    const result = await isGitHubOrgAdmin(
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
        githubAccessTokenEncrypted: "enc-token",
      },
      "fiveonefour"
    )
    expect(result).toBe(false)
  })

  it("throws on non-OK non-404 response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Server Error", { status: 500 })) as typeof global.fetch

    await expect(
      isGitHubOrgAdmin(
        {
          id: "user_1",
          githubId: "1001",
          githubUsername: "orgadmin",
          githubAccessTokenEncrypted: "enc-token",
        },
        "fiveonefour"
      )
    ).rejects.toThrow("Failed GitHub org membership check: 500")
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

  it("throws when GitHub org-admin check fails", async () => {
    vi.stubEnv("NODE_ENV", "production")
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as typeof global.fetch

    await expect(
      filterInstalledOrganizationsForAdmin(
        {
          id: "user_1",
          githubId: "1001",
          githubUsername: "orgadmin",
          githubAccessTokenEncrypted: "enc-token",
        },
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
    ).rejects.toThrow("GitHub org-admin checks failed")
  })
})
