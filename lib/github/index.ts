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
export type {
  GitHubUser,
  OrgMembershipStatus,
  RepositoryPermissionLevel,
  CheckRun,
  CheckRunConclusion,
  CheckRunStatus,
  IssueComment,
  CreateCheckRunParams,
  UpdateCheckRunParams,
  CreateCommentParams,
  UpdateCommentParams,
  ListCommentsParams,
  PullRequestRef,
} from "./types"

// Test-only exports — only import these from test/dev code paths
export {
  resetMockGitHub,
  getAllCheckRuns,
  getAllComments,
  upsertMockPullRequest,
} from "./mock-github-client"

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
    return new OctokitGitHubClient(installationId)
  }

  if (useRealGitHubInDev && hasAppCredentials && installationId) {
    return new OctokitGitHubClient(installationId)
  }

  return getMockGitHubClient()
}
