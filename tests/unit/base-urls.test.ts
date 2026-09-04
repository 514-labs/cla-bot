import { afterEach, describe, expect, it, vi } from "vitest"
import { getGitHubApiBaseUrl, getGitHubWebBaseUrl } from "@/lib/github/base-urls"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GitHub base URLs", () => {
  it("defaults to the real GitHub hosts", () => {
    vi.stubEnv("GITHUB_OAUTH_BASE_URL", "")
    vi.stubEnv("GITHUB_API_BASE_URL", "")
    expect(getGitHubWebBaseUrl()).toBe("https://github.com")
    expect(getGitHubApiBaseUrl()).toBe("https://api.github.com")
  })

  it("honours env overrides", () => {
    vi.stubEnv("GITHUB_OAUTH_BASE_URL", "http://127.0.0.1:3998")
    vi.stubEnv("GITHUB_API_BASE_URL", "http://127.0.0.1:3999")
    expect(getGitHubWebBaseUrl()).toBe("http://127.0.0.1:3998")
    expect(getGitHubApiBaseUrl()).toBe("http://127.0.0.1:3999")
  })

  it("trims whitespace and strips trailing slashes", () => {
    vi.stubEnv("GITHUB_OAUTH_BASE_URL", "  http://localhost:3998/  ")
    vi.stubEnv("GITHUB_API_BASE_URL", "http://localhost:3998///")
    expect(getGitHubWebBaseUrl()).toBe("http://localhost:3998")
    expect(getGitHubApiBaseUrl()).toBe("http://localhost:3998")
  })

  it("treats whitespace-only values as unset", () => {
    vi.stubEnv("GITHUB_OAUTH_BASE_URL", "   ")
    expect(getGitHubWebBaseUrl()).toBe("https://github.com")
  })
})
