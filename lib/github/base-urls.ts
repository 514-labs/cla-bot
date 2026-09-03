/**
 * Configurable GitHub base URLs.
 *
 * Production talks to github.com / api.github.com. Local development can point
 * both at the mock GitHub server (scripts/mock-github-server.ts) by setting
 * GITHUB_OAUTH_BASE_URL and GITHUB_API_BASE_URL, so the full OAuth sign-in flow
 * and every direct api.github.com call work without a real GitHub account.
 *
 * Defaults must stay byte-identical to the historical hardcoded URLs — unit
 * tests mock `fetch` by exact URL string.
 */

const DEFAULT_WEB_BASE_URL = "https://github.com"
const DEFAULT_API_BASE_URL = "https://api.github.com"

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim()
  if (!trimmed) return fallback
  return trimmed.replace(/\/+$/, "")
}

/** Base URL for the GitHub web host (OAuth authorize + access_token endpoints). */
export function getGitHubWebBaseUrl(): string {
  return normalizeBaseUrl(process.env.GITHUB_OAUTH_BASE_URL, DEFAULT_WEB_BASE_URL)
}

/** Base URL for the GitHub REST API (`/user`, `/search/users`, Octokit `baseUrl`, ...). */
export function getGitHubApiBaseUrl(): string {
  return normalizeBaseUrl(process.env.GITHUB_API_BASE_URL, DEFAULT_API_BASE_URL)
}
