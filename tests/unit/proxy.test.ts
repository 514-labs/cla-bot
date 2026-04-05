import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { SignJWT } from "jose"

const TEST_SECRET = "test-session-secret-that-is-long-enough"
const SECRET_BYTES = new TextEncoder().encode(TEST_SECRET)

async function createTestToken(overrides?: { expired?: boolean }): Promise<string> {
  const builder = new SignJWT({
    userId: "user_1",
    githubUsername: "orgadmin",
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti("test-jti")

  if (overrides?.expired) {
    builder
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
  } else {
    builder.setIssuedAt().setExpirationTime("30d")
  }

  return builder.sign(SECRET_BYTES)
}

function makeRequest(path: string, cookie?: string): NextRequest {
  const url = `http://localhost:3000${path}`
  const headers = new Headers()
  if (cookie) {
    headers.set("cookie", cookie)
  }
  return new NextRequest(url, { headers })
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Dynamic import so env vars are available when proxy module loads
async function getProxy() {
  // Clear module cache to pick up fresh env
  const mod = await import("@/proxy")
  return mod.default
}

describe("proxy — protected page routes", () => {
  it("redirects to signin when no cookie on /admin", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/admin")
    const res = await proxy(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location")!
    const redirectUrl = new URL(location)
    expect(redirectUrl.pathname).toBe("/auth/signin")
    expect(redirectUrl.searchParams.get("returnTo")).toBe("/admin")
    expect(redirectUrl.searchParams.get("reason")).toBe("session_expired")
  })

  it("redirects to signin when expired cookie on /contributor", async () => {
    const proxy = await getProxy()
    const expiredToken = await createTestToken({ expired: true })
    const req = makeRequest("/contributor", `cla-session=${expiredToken}`)
    const res = await proxy(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location")!
    expect(new URL(location).pathname).toBe("/auth/signin")
  })

  it("passes through with valid cookie on /admin", async () => {
    const proxy = await getProxy()
    const token = await createTestToken()
    const req = makeRequest("/admin", `cla-session=${token}`)
    const res = await proxy(req)

    // NextResponse.next() has no redirect status
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
  })

  it("preserves returnTo with query string", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/admin?tab=settings&org=foo")
    const res = await proxy(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location")!
    const redirectUrl = new URL(location)
    expect(redirectUrl.searchParams.get("returnTo")).toBe("/admin?tab=settings&org=foo")
  })

  it("redirects /contributor/subpath", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/contributor/signatures")
    const res = await proxy(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location")!
    expect(new URL(location).searchParams.get("returnTo")).toBe("/contributor/signatures")
  })
})

describe("proxy — protected API routes", () => {
  it("returns 401 JSON when no cookie on /api/orgs", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/api/orgs")
    const res = await proxy(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 401 JSON when expired cookie on /api/contributor", async () => {
    const proxy = await getProxy()
    const expiredToken = await createTestToken({ expired: true })
    const req = makeRequest("/api/contributor", `cla-session=${expiredToken}`)
    const res = await proxy(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("passes through with valid cookie on /api/orgs", async () => {
    const proxy = await getProxy()
    const token = await createTestToken()
    const req = makeRequest("/api/orgs", `cla-session=${token}`)
    const res = await proxy(req)

    expect(res.status).toBe(200)
  })

  it("returns 401 for /api/github/install without auth", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/api/github/install")
    const res = await proxy(req)

    expect(res.status).toBe(401)
  })
})

describe("proxy — public routes", () => {
  it("passes through / without auth", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/")
    const res = await proxy(req)

    expect(res.status).toBe(200)
  })

  it("passes through /sign/my-org without auth", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/sign/my-org")
    const res = await proxy(req)

    expect(res.status).toBe(200)
  })

  it("passes through /api/auth/session without auth", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/api/auth/session")
    const res = await proxy(req)

    expect(res.status).toBe(200)
  })

  it("passes through /api/auth/github without auth", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/api/auth/github")
    const res = await proxy(req)

    expect(res.status).toBe(200)
  })

  it("passes through /api/webhook without auth", async () => {
    const proxy = await getProxy()
    const req = makeRequest("/api/webhook")
    const res = await proxy(req)

    expect(res.status).toBe(200)
  })
})

describe("proxy — missing SESSION_SECRET", () => {
  it("rejects protected route when SESSION_SECRET is not set", async () => {
    vi.stubEnv("SESSION_SECRET", "")
    const proxy = await getProxy()
    const token = await createTestToken() // signed with the real secret
    const req = makeRequest("/admin", `cla-session=${token}`)
    const res = await proxy(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location")!
    expect(new URL(location).pathname).toBe("/auth/signin")
  })
})
