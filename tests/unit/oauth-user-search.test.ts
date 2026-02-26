import { afterEach, describe, expect, it, vi } from "vitest"
import { searchGitHubUsersWithOAuth } from "@/lib/github/oauth-user-search"

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.clearAllMocks()
})

describe("searchGitHubUsersWithOAuth", () => {
  it("returns empty array for empty query", async () => {
    const result = await searchGitHubUsersWithOAuth({
      accessToken: "token",
      query: "  ",
    })
    expect(result).toEqual([])
  })

  it("returns mapped user results from GitHub API", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 1001,
              login: "orgadmin",
              avatar_url: "https://avatars.githubusercontent.com/u/1001",
              type: "User",
            },
            {
              id: 1002,
              login: "contributor1",
              avatar_url: "https://avatars.githubusercontent.com/u/1002",
              type: "User",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as typeof global.fetch

    const result = await searchGitHubUsersWithOAuth({
      accessToken: "test-token",
      query: "org",
      limit: 5,
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      githubUserId: "1001",
      githubUsername: "orgadmin",
      avatarUrl: "https://avatars.githubusercontent.com/u/1001",
      type: "User",
    })
  })

  it("filters out items without id or login", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: 1001, login: "valid" }, { login: "no-id" }, { id: 1002 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as typeof global.fetch

    const result = await searchGitHubUsersWithOAuth({
      accessToken: "token",
      query: "test",
    })
    expect(result).toHaveLength(1)
    expect(result[0].githubUsername).toBe("valid")
  })

  it("throws on non-OK response", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 })) as typeof global.fetch

    await expect(
      searchGitHubUsersWithOAuth({ accessToken: "bad-token", query: "test" })
    ).rejects.toThrow("GitHub user search failed (401)")
  })

  it("handles missing items in response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof global.fetch

    const result = await searchGitHubUsersWithOAuth({
      accessToken: "token",
      query: "test",
    })
    expect(result).toEqual([])
  })

  it("clamps limit between 1 and 20", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof global.fetch

    await searchGitHubUsersWithOAuth({
      accessToken: "token",
      query: "test",
      limit: 100,
    })

    const callUrl = vi.mocked(global.fetch).mock.calls[0][0] as URL
    expect(callUrl.searchParams.get("per_page")).toBe("20")
  })

  it("defaults type to User when not provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: 1, login: "user1" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as typeof global.fetch

    const result = await searchGitHubUsersWithOAuth({
      accessToken: "token",
      query: "user1",
    })
    expect(result[0].type).toBe("User")
  })
})
