import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/queries", () => ({
  getOrganizationBySlug: vi.fn(),
  getSignatureStatus: vi.fn(),
  createSignature: vi.fn(),
  createAuditEvent: vi.fn(),
}))

import { getBaseUrlFromHeaders } from "@/lib/cla/signing"

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

function makeHeaders(entries: Record<string, string>): Pick<Headers, "get"> {
  const map = new Map(Object.entries(entries))
  return { get: (key: string) => map.get(key) ?? null }
}

describe("getBaseUrlFromHeaders", () => {
  it("returns NEXT_PUBLIC_APP_URL when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cla.example.com")
    const result = getBaseUrlFromHeaders(makeHeaders({}))
    expect(result).toBe("https://cla.example.com")
  })

  it("trims NEXT_PUBLIC_APP_URL whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "  https://cla.example.com  ")
    const result = getBaseUrlFromHeaders(makeHeaders({}))
    expect(result).toBe("https://cla.example.com")
  })

  it("builds URL from x-forwarded-host and x-forwarded-proto", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(
      makeHeaders({
        "x-forwarded-host": "cla.example.com",
        "x-forwarded-proto": "https",
      })
    )
    expect(result).toBe("https://cla.example.com")
  })

  it("falls back to host header when x-forwarded-host is absent", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(
      makeHeaders({
        host: "cla.example.com",
      })
    )
    expect(result).toBe("https://cla.example.com")
  })

  it("sanitizes invalid x-forwarded-proto to https", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(
      makeHeaders({
        "x-forwarded-host": "cla.example.com",
        "x-forwarded-proto": "javascript",
      })
    )
    expect(result).toBe("https://cla.example.com")
  })

  it("sanitizes ftp x-forwarded-proto to https", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(
      makeHeaders({
        "x-forwarded-host": "cla.example.com",
        "x-forwarded-proto": "ftp",
      })
    )
    expect(result).toBe("https://cla.example.com")
  })

  it("allows http x-forwarded-proto", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(
      makeHeaders({
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
      })
    )
    expect(result).toBe("http://localhost:3000")
  })

  it("defaults to https when no x-forwarded-proto", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(
      makeHeaders({
        "x-forwarded-host": "cla.example.com",
      })
    )
    expect(result).toBe("https://cla.example.com")
  })

  it("returns fallback when no host headers present", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = getBaseUrlFromHeaders(makeHeaders({}))
    expect(result).toBe("https://cla.fiveonefour.com")
  })
})
