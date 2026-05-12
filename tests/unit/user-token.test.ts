import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` throws on import outside a server component; in Vitest we
// substitute a no-op so the helper module under test can be loaded.
vi.mock("server-only", () => ({}))

vi.mock("@/lib/db/queries", () => ({
  getUserById: vi.fn(),
  rotateUserGithubTokens: vi.fn(),
  clearUserGithubTokens: vi.fn(),
}))

vi.mock("@/lib/security/encryption", () => ({
  decryptSecret: vi.fn((payload: string) => payload.replace(/^enc:/, "")),
  encryptSecret: vi.fn((plain: string) => `enc:${plain}`),
}))

import { clearUserGithubTokens, getUserById, rotateUserGithubTokens } from "@/lib/db/queries"
import { getValidUserAccessToken } from "@/lib/github/user-token"

const USER_ID = "user_1"

function makeUser(overrides: Partial<NonNullable<Awaited<ReturnType<typeof getUserById>>>> = {}) {
  return {
    id: USER_ID,
    githubId: "1",
    githubUsername: "test-user",
    githubAccessTokenEncrypted: "enc:current-access",
    githubAccessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    githubRefreshTokenEncrypted: "enc:current-refresh",
    githubRefreshTokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    githubTokenKind: "refreshable",
    githubTokenScopes: null,
    githubTokenUpdatedAt: null,
    avatarUrl: "",
    name: "Test User",
    email: "",
    emailVerified: false,
    emailSource: "none",
    role: "admin",
    ...overrides,
  } as unknown as NonNullable<Awaited<ReturnType<typeof getUserById>>>
}

beforeEach(() => {
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret")
  vi.mocked(rotateUserGithubTokens).mockReset()
  vi.mocked(clearUserGithubTokens).mockReset()
  vi.mocked(getUserById).mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("getValidUserAccessToken", () => {
  it("returns the cached access token when not within the refresh window", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser())
    const token = await getValidUserAccessToken(USER_ID)
    expect(token).toBe("current-access")
    expect(rotateUserGithubTokens).not.toHaveBeenCalled()
  })

  it("returns null and does not refresh for a legacy_user row", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ githubTokenKind: "legacy_user" }))
    const token = await getValidUserAccessToken(USER_ID)
    expect(token).toBeNull()
    expect(rotateUserGithubTokens).not.toHaveBeenCalled()
  })

  it("clears tokens and returns null when the refresh token is expired", async () => {
    vi.mocked(getUserById).mockResolvedValue(
      makeUser({
        githubAccessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        githubRefreshTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      })
    )
    const token = await getValidUserAccessToken(USER_ID)
    expect(token).toBeNull()
    expect(clearUserGithubTokens).toHaveBeenCalledWith(USER_ID)
  })

  it("refreshes when within the expiry buffer and persists the rotated pair", async () => {
    vi.mocked(getUserById).mockResolvedValue(
      makeUser({
        githubAccessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString(), // < 60s
      })
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "new-access",
              expires_in: 28_800,
              refresh_token: "new-refresh",
              refresh_token_expires_in: 15_897_600,
              scope: "",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      )
    )
    vi.mocked(rotateUserGithubTokens).mockResolvedValue(makeUser())

    const token = await getValidUserAccessToken(USER_ID)

    expect(token).toBe("new-access")
    expect(rotateUserGithubTokens).toHaveBeenCalledOnce()
    const rotateArgs = vi.mocked(rotateUserGithubTokens).mock.calls[0][1]
    expect(rotateArgs.expectedRefreshTokenEncrypted).toBe("enc:current-refresh")
    expect(rotateArgs.next.accessTokenEncrypted).toBe("enc:new-access")
    expect(rotateArgs.next.refreshTokenEncrypted).toBe("enc:new-refresh")
  })

  it("clears tokens and returns null when GitHub responds with bad_refresh_token", async () => {
    vi.mocked(getUserById)
      .mockResolvedValueOnce(
        makeUser({
          githubAccessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        })
      )
      // peer re-SELECT also returns expired
      .mockResolvedValueOnce(
        makeUser({
          githubAccessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        })
      )
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "bad_refresh_token",
              error_description: "single-use refresh token already consumed",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      )
    )

    const token = await getValidUserAccessToken(USER_ID)
    expect(token).toBeNull()
    expect(clearUserGithubTokens).toHaveBeenCalledWith(USER_ID)
  })

  it("returns the peer-rotated token when a race loses the optimistic update", async () => {
    vi.mocked(getUserById)
      .mockResolvedValueOnce(
        makeUser({
          githubAccessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        })
      )
      // peer rotated a fresh token while we were exchanging
      .mockResolvedValueOnce(
        makeUser({
          githubAccessTokenEncrypted: "enc:peer-access",
          githubAccessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          githubRefreshTokenEncrypted: "enc:peer-refresh",
        })
      )
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "would-have-won",
              expires_in: 28_800,
              refresh_token: "would-have-won-refresh",
              refresh_token_expires_in: 15_897_600,
              scope: "",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      )
    )
    // optimistic update finds no matching row — we lost the race
    vi.mocked(rotateUserGithubTokens).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof rotateUserGithubTokens>>
    )

    const token = await getValidUserAccessToken(USER_ID)
    expect(token).toBe("peer-access")
    expect(clearUserGithubTokens).not.toHaveBeenCalled()
  })
})
