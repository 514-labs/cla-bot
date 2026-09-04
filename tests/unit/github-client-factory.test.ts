import { afterEach, describe, expect, it, vi } from "vitest"
import { clearGitHubClientCache, getGitHubClient } from "@/lib/github/index"

afterEach(() => {
  vi.unstubAllEnvs()
  clearGitHubClientCache()
})

describe("getGitHubClient installation cache", () => {
  it("reuses one real client per installation id across calls", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GITHUB_APP_ID", "12345")
    vi.stubEnv("GITHUB_PRIVATE_KEY", "fake-key")

    const first = getGitHubClient(1001)
    const second = getGitHubClient(1001)
    const other = getGitHubClient(1002)
    expect(second).toBe(first)
    expect(other).not.toBe(first)
  })

  it("forgets clients when the cache is cleared", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GITHUB_APP_ID", "12345")
    vi.stubEnv("GITHUB_PRIVATE_KEY", "fake-key")

    const first = getGitHubClient(1001)
    clearGitHubClientCache()
    expect(getGitHubClient(1001)).not.toBe(first)
  })
})

describe("getGitHubClient", () => {
  it("returns mock client in development without app credentials", () => {
    vi.stubEnv("NODE_ENV", "development")
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_PRIVATE_KEY

    const client = getGitHubClient()
    expect(client).toBeDefined()
    // Should be a MockGitHubClient
    expect(typeof client.getUser).toBe("function")
    expect(typeof client.checkOrgMembership).toBe("function")
  })

  it("returns mock client in test without app credentials", () => {
    vi.stubEnv("NODE_ENV", "test")
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_PRIVATE_KEY

    const client = getGitHubClient()
    expect(client).toBeDefined()
  })

  it("throws in production without app credentials", () => {
    vi.stubEnv("NODE_ENV", "production")
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_PRIVATE_KEY

    expect(() => getGitHubClient()).toThrow(
      "GitHub App credentials are not configured in production"
    )
  })

  it("throws in production without installation ID", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GITHUB_APP_ID", "12345")
    vi.stubEnv("GITHUB_PRIVATE_KEY", "fake-key")

    expect(() => getGitHubClient()).toThrow("GitHub App installation ID is required in production")
  })

  it("returns mock client in dev even with credentials when USE_REAL_GITHUB_APP is not set", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("GITHUB_APP_ID", "12345")
    vi.stubEnv("GITHUB_PRIVATE_KEY", "fake-key")
    delete process.env.USE_REAL_GITHUB_APP

    const client = getGitHubClient(12001)
    expect(client).toBeDefined()
  })
})
