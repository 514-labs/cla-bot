import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/server/org-access", () => ({
  authorizeOrgAccess: vi.fn(),
}))

vi.mock("@/lib/db/queries", () => ({
  getBypassAccountsByOrg: vi.fn(),
}))

vi.mock("@/lib/github/user-token", () => ({
  getValidUserAccessToken: vi.fn(),
}))

vi.mock("@/lib/github/oauth-user-search", () => ({
  searchGitHubUsersWithOAuth: vi.fn(),
}))

import { authorizeOrgAccess } from "@/lib/server/org-access"
import { getBypassAccountsByOrg } from "@/lib/db/queries"
import { getValidUserAccessToken } from "@/lib/github/user-token"
import { searchGitHubUsersWithOAuth } from "@/lib/github/oauth-user-search"
import { GET } from "@/app/api/admin/orgs/[orgSlug]/bypass/suggest/route"

const ORG_SLUG = "acme"

function makeRequest(queryString: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/admin/orgs/${ORG_SLUG}/bypass/suggest${queryString}`
  )
}

function callRoute(queryString: string) {
  return GET(makeRequest(queryString), { params: Promise.resolve({ orgSlug: ORG_SLUG }) })
}

beforeEach(() => {
  vi.mocked(authorizeOrgAccess).mockResolvedValue({
    ok: true,
    org: { id: "org_1", githubOrgSlug: ORG_SLUG },
    user: { id: "user_1", githubUsername: "orgadmin" },
  } as unknown as Awaited<ReturnType<typeof authorizeOrgAccess>>)
  vi.mocked(getBypassAccountsByOrg).mockResolvedValue(
    [] as unknown as Awaited<ReturnType<typeof getBypassAccountsByOrg>>
  )
  vi.mocked(getValidUserAccessToken).mockResolvedValue("oauth-token")
  vi.mocked(searchGitHubUsersWithOAuth).mockResolvedValue([
    {
      githubUserId: "1001",
      githubUsername: "octocat",
      avatarUrl: "https://example.com/a.png",
      type: "User",
    },
  ] as unknown as Awaited<ReturnType<typeof searchGitHubUsersWithOAuth>>)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("bypass suggest route: kind param validation", () => {
  it("returns 400 for an unknown explicit kind", async () => {
    const res = await callRoute("?kind=admin&q=octo")

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("kind")
    expect(getBypassAccountsByOrg).not.toHaveBeenCalled()
    expect(searchGitHubUsersWithOAuth).not.toHaveBeenCalled()
  })

  it("returns 400 for an empty explicit kind", async () => {
    const res = await callRoute("?kind=&q=octo")

    expect(res.status).toBe(400)
    expect(searchGitHubUsersWithOAuth).not.toHaveBeenCalled()
  })

  it("defaults to the user kind when the param is absent", async () => {
    const res = await callRoute("?q=octo")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toEqual([
      {
        kind: "user",
        githubUserId: "1001",
        githubUsername: "octocat",
        avatarUrl: "https://example.com/a.png",
        type: "User",
        alreadyBypassed: false,
      },
    ])
  })

  it("accepts kind=user", async () => {
    const res = await callRoute("?kind=user&q=octo")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions[0].kind).toBe("user")
  })

  it("accepts kind=app_bot", async () => {
    vi.mocked(searchGitHubUsersWithOAuth).mockResolvedValue([
      {
        githubUserId: "2002",
        githubUsername: "dependabot[bot]",
        avatarUrl: "https://example.com/b.png",
        type: "Bot",
      },
    ] as unknown as Awaited<ReturnType<typeof searchGitHubUsersWithOAuth>>)

    const res = await callRoute("?kind=app_bot&q=dependabot")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions[0]).toMatchObject({
      kind: "app_bot",
      actorSlug: "dependabot",
      githubUsername: "dependabot[bot]",
    })
  })

  it("still returns a manual app_bot suggestion when no OAuth token is available", async () => {
    vi.mocked(getValidUserAccessToken).mockResolvedValue(null)

    const res = await callRoute("?kind=app_bot&q=dependabot")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions[0]).toMatchObject({
      kind: "app_bot",
      actorSlug: "dependabot",
      source: "manual",
    })
  })

  it("short-circuits on a too-short query for a valid kind", async () => {
    const res = await callRoute("?kind=user&q=o")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toEqual([])
    expect(searchGitHubUsersWithOAuth).not.toHaveBeenCalled()
  })
})
