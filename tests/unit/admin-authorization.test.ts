import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/github/user-token", () => ({
  getValidUserAccessToken: vi.fn(async (userId: string) =>
    userId === "user_1" ? "oauth-token" : null
  ),
}))

import {
  filterInstalledOrganizationsForAdmin,
  isGitHubInstallationAccountAdmin,
} from "@/lib/github/admin-authorization"
import { getValidUserAccessToken } from "@/lib/github/user-token"

const originalFetch = global.fetch

afterEach(() => {
  vi.unstubAllEnvs()
  global.fetch = originalFetch
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
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { state: "active", role: "admin", organization: { login: "fiveonefour", id: 2001 } },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as typeof global.fetch

    const authorized = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
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
    expect(getValidUserAccessToken).toHaveBeenCalledWith("user_1")
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("does not authorize an org install when the live org id differs from the stored account id", async () => {
    vi.stubEnv("NODE_ENV", "production")
    // The user is an admin of *an* org called fiveonefour, but it is a new org
    // that re-registered the login after the original (id 2001) renamed itself.
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { state: "active", role: "admin", organization: { login: "fiveonefour", id: 777777 } },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as typeof global.fetch

    const authorized = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "fiveonefour",
          githubAccountType: "organization",
          githubAccountId: "2001",
          installationId: 12002,
        },
        {
          adminUserId: "user_2",
          githubOrgSlug: "legacy-org",
          githubAccountType: "organization",
          githubAccountId: null,
          installationId: 12004,
        },
      ]
    )

    expect(authorized.map((org) => org.githubOrgSlug)).toEqual([])
  })

  it("still authorizes a legacy org install with no stored account id", async () => {
    vi.stubEnv("NODE_ENV", "production")
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { state: "active", role: "admin", organization: { login: "legacy-org", id: 3001 } },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as typeof global.fetch

    const authorized = await filterInstalledOrganizationsForAdmin(
      { id: "user_1", githubId: "1001", githubUsername: "orgadmin" },
      [
        {
          adminUserId: "user_2",
          githubOrgSlug: "legacy-org",
          githubAccountType: "organization",
          githubAccountId: null,
          installationId: 12004,
        },
      ]
    )

    expect(authorized.map((org) => org.githubOrgSlug)).toEqual(["legacy-org"])
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
