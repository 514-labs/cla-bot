/**
 * GitHub client factory.
 *
 * In production with real env vars, returns an Octokit-based client
 * authenticated as a GitHub App installation.
 * In development/tests without env vars, falls back to the mock client.
 */

import type { GitHubClient } from "./client"
import { OctokitGitHubClient } from "./octokit-client"
import { getMockGitHubClient } from "./mock-github-client"

export type { GitHubClient }
// Test-only exports — only import these from test/dev code paths
export {
  resetMockGitHub,
  getAllCheckRuns,
  getAllComments,
  upsertMockPullRequest,
  getMockGitHubCallLog,
  configureMockGitHub,
  getMockGitHubConfig,
} from "./mock-github-client"

/**
 * One Octokit client per installation, kept for the life of the process.
 *
 * `@octokit/auth-app` caches the installation access token *inside* the auth
 * strategy instance and refreshes it shortly before its one-hour expiry. A
 * fresh client per request therefore paid a JWT signature plus a
 * `POST /app/installations/{id}/access_tokens` round trip on every webhook.
 * Fluid Compute reuses function instances across requests, so this cache is
 * hit most of the time.
 */
const MAX_CACHED_CLIENTS = 500
const clientCache = new Map<number, OctokitGitHubClient>()

function getOctokitClient(installationId: number): OctokitGitHubClient {
  const cached = clientCache.get(installationId)
  if (cached) return cached

  const client = new OctokitGitHubClient(installationId)
  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    const oldest = clientCache.keys().next().value
    if (oldest !== undefined) clientCache.delete(oldest)
  }
  clientCache.set(installationId, client)
  return client
}

/** Test hook: forget cached installation clients. */
export function clearGitHubClientCache() {
  clientCache.clear()
}

/**
 * Get the GitHub client for the given installation.
 * Returns the real Octokit client when GitHub App credentials are configured,
 * otherwise falls back to the mock client for dev/test.
 */
export function getGitHubClient(installationId?: number): GitHubClient {
  const hasAppCredentials = Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY)
  const useRealGitHubInDev = process.env.USE_REAL_GITHUB_APP === "true"

  if (process.env.NODE_ENV === "production") {
    if (!hasAppCredentials) {
      throw new Error("GitHub App credentials are not configured in production")
    }
    if (!installationId) {
      throw new Error("GitHub App installation ID is required in production")
    }
    return getOctokitClient(installationId)
  }

  if (useRealGitHubInDev && hasAppCredentials && installationId) {
    return getOctokitClient(installationId)
  }

  return getMockGitHubClient()
}
