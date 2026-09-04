import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createMockFetch, MOCK_GITHUB_USER } from "../utils/mock-oauth-server"

// Mock dependencies
vi.mock("@/lib/db/queries", () => ({
  upsertUser: vi.fn(),
  setUserGithubTokens: vi.fn(),
}))

vi.mock("@/lib/security/encryption", () => ({
  encryptSecret: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  createSessionToken: vi.fn(),
  getSessionCookieOptions: vi.fn(() => ({
    name: "cla-session",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 2592000,
  })),
}))

import { upsertUser, setUserGithubTokens } from "@/lib/db/queries"
import { encryptSecret } from "@/lib/security/encryption"
import { createSessionToken } from "@/lib/auth"
import { GET } from "@/app/api/auth/github/route"

// The route generates the state nonce with crypto.randomUUID(), and now
// validates that the callback `state` matches that shape.
const NONCE = "3f1d2c4b-5a6e-4f80-9b1c-2d3e4f5a6b7c"
const OTHER_NONCE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const RETURN_TO = "/dashboard"
const STATE_COOKIE_VALUE = `${NONCE}:${encodeURIComponent(RETURN_TO)}`

function makeCallbackRequest(overrides?: {
  code?: string | null
  state?: string | null
  stateCookie?: string | null
  returnTo?: string
}): NextRequest {
  const code = overrides?.code ?? "valid-code"
  const state = overrides?.state ?? NONCE
  const stateCookie =
    overrides?.stateCookie !== undefined ? overrides.stateCookie : STATE_COOKIE_VALUE

  const params = new URLSearchParams()
  if (code) params.set("code", code)
  if (state) params.set("state", state)

  const url = `http://localhost:3000/api/auth/github?${params.toString()}`
  const headers = new Headers()
  if (stateCookie) {
    headers.set("cookie", `cla-github-oauth-state=${stateCookie}`)
  }

  return new NextRequest(url, { headers })
}

function makeInitiateRequest(returnTo?: string): NextRequest {
  const params = new URLSearchParams()
  if (returnTo) params.set("returnTo", returnTo)
  const url = `http://localhost:3000/api/auth/github?${params.toString()}`
  return new NextRequest(url)
}

beforeEach(() => {
  vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id")
  vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret")
  vi.stubEnv("SESSION_SECRET", "test-session-secret-that-is-long-enough")

  vi.mocked(upsertUser).mockResolvedValue({
    id: "user_1",
    githubId: MOCK_GITHUB_USER.id,
    githubUsername: MOCK_GITHUB_USER.login,
    avatarUrl: MOCK_GITHUB_USER.avatar_url,
    name: MOCK_GITHUB_USER.name,
    email: MOCK_GITHUB_USER.email,
    role: "admin",
  } as unknown as Awaited<ReturnType<typeof upsertUser>>)

  vi.mocked(setUserGithubTokens).mockResolvedValue(
    undefined as unknown as Awaited<ReturnType<typeof setUserGithubTokens>>
  )
  vi.mocked(encryptSecret).mockImplementation((value) => `enc(${value})`)
  vi.mocked(createSessionToken).mockResolvedValue("mock-jwt-token")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("OAuth initiation (no code param)", () => {
  it("redirects to GitHub authorize URL", async () => {
    const req = makeInitiateRequest("/contributor")
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    const redirectUrl = new URL(location)
    expect(redirectUrl.hostname).toBe("github.com")
    expect(redirectUrl.pathname).toBe("/login/oauth/authorize")
    expect(redirectUrl.searchParams.get("client_id")).toBe("test-client-id")
    expect(redirectUrl.searchParams.get("scope")).toBe("read:user,read:org,user:email")
  })

  it("sets OAuth state cookie", async () => {
    const req = makeInitiateRequest("/contributor")
    const res = await GET(req)

    const stateCookie = res.cookies.get("cla-github-oauth-state")
    expect(stateCookie).toBeDefined()
    expect(stateCookie?.value).toBeTruthy()
  })

  it("returns 500 when GITHUB_CLIENT_ID is missing", async () => {
    delete process.env.GITHUB_CLIENT_ID
    const req = makeInitiateRequest()
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain("GITHUB_CLIENT_ID")
  })
})

describe("OAuth callback (with code param)", () => {
  it("happy path: exchanges code, creates user, sets session cookie, redirects", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(new URL(location).pathname).toBe("/dashboard")

    // Session cookie was set
    const sessionCookie = res.cookies.get("cla-session")
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.value).toBe("mock-jwt-token")

    // OAuth state cookie was cleared
    const stateCookie = res.cookies.get("cla-github-oauth-state")
    expect(stateCookie?.value).toBe("")

    // DB calls were made
    expect(upsertUser).toHaveBeenCalledOnce()
    expect(setUserGithubTokens).toHaveBeenCalledOnce()
    expect(createSessionToken).toHaveBeenCalledOnce()

    const tokenCall = vi.mocked(setUserGithubTokens).mock.calls[0]
    expect(tokenCall[0]).toBe("user_1")
    expect(tokenCall[1]).toMatchObject({
      accessTokenEncrypted: expect.stringContaining("ghu_"),
      refreshTokenEncrypted: expect.stringContaining("ghr_"),
      accessTokenExpiresAt: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    })
    // Expiries are ISO timestamps in the future
    expect(new Date(tokenCall[1].accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(new Date(tokenCall[1].refreshTokenExpiresAt).getTime()).toBeGreaterThan(
      new Date(tokenCall[1].accessTokenExpiresAt).getTime()
    )
  })

  it("redirects to error page when state cookie is missing", async () => {
    const req = makeCallbackRequest({ stateCookie: null })
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=github_state")
  })

  it("redirects to error page when state nonce mismatches", async () => {
    const req = makeCallbackRequest({ state: OTHER_NONCE })
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=github_state")
  })

  it("redirects to error page when GitHub returns token error", async () => {
    const mockFetch = createMockFetch("token_error")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=github_token")
  })

  it("redirects to error page when GitHub returns no access_token", async () => {
    const mockFetch = createMockFetch("token_missing")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=github_token")
  })

  it("redirects to error page when GitHub user fetch returns 401 (revoked token)", async () => {
    const mockFetch = createMockFetch("user_unauthorized")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=github_user")
  })

  it("redirects to error page when GitHub user fetch returns 500", async () => {
    const mockFetch = createMockFetch("user_fetch_error")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=github_user")
  })

  it("redirects to error page when GITHUB_CLIENT_SECRET is missing", async () => {
    delete process.env.GITHUB_CLIENT_SECRET
    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(500)
  })

  it("redirects to error page when encryption fails", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)
    vi.mocked(encryptSecret).mockReturnValue(null)

    const req = makeCallbackRequest()
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(location).toContain("error=server_config")
  })
})

describe("callback param validation", () => {
  it("rejects a malformed code without exchanging it for a token", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest({ code: "not a valid code!" })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location") ?? "").toContain("error=github_code")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects an over-long code", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest({ code: "a".repeat(257) })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location") ?? "").toContain("error=github_code")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects a non-UUID state without exchanging the code", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const req = makeCallbackRequest({ state: "not-a-uuid" })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location") ?? "").toContain("error=github_state")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects a missing state without exchanging the code", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const headers = new Headers({ cookie: `cla-github-oauth-state=${STATE_COOKIE_VALUE}` })
    const req = new NextRequest("http://localhost:3000/api/auth/github?code=valid-code", {
      headers,
    })
    const res = await GET(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location") ?? "").toContain("error=github_state")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("clears the OAuth state cookie when a param is rejected", async () => {
    const req = makeCallbackRequest({ code: "bad code" })
    const res = await GET(req)

    expect(res.cookies.get("cla-github-oauth-state")?.value).toBe("")
  })
})

describe("returnTo sanitization", () => {
  it("uses returnTo from state cookie in redirect", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const stateCookie = `${NONCE}:${encodeURIComponent("/contributor")}`
    const req = makeCallbackRequest({ stateCookie })
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(new URL(location).pathname).toBe("/contributor")
  })

  it("falls back to /dashboard for absolute URL in returnTo", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const stateCookie = `${NONCE}:${encodeURIComponent("https://evil.com/steal")}`
    const req = makeCallbackRequest({ stateCookie })
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(new URL(location).pathname).toBe("/dashboard")
  })

  it("falls back to /dashboard for // prefix in returnTo", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    const stateCookie = `${NONCE}:${encodeURIComponent("//evil.com/steal")}`
    const req = makeCallbackRequest({ stateCookie })
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(new URL(location).pathname).toBe("/dashboard")
  })

  it("falls back to /dashboard for a backslash returnTo that the URL parser would treat as //", async () => {
    const mockFetch = createMockFetch("success")
    vi.stubGlobal("fetch", mockFetch)

    // `new URL("/\\evil.com", base)` resolves to https://evil.com/ because the
    // WHATWG parser treats a backslash as a forward slash.
    const stateCookie = `${NONCE}:${encodeURIComponent("/\\evil.com/steal")}`
    const req = makeCallbackRequest({ stateCookie })
    const res = await GET(req)

    expect(res.status).toBe(307)
    const location = requireHeader(res, "location")
    expect(new URL(location).origin).toBe("http://localhost:3000")
    expect(new URL(location).pathname).toBe("/dashboard")
  })
})

function requireHeader(response: Response, name: string): string {
  const value = response.headers.get(name)
  if (value === null) {
    throw new Error(`Expected response header "${name}" to be present`)
  }
  return value
}
