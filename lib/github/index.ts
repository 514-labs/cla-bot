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
  CheckRun,
  CheckRunConclusion,
  CheckRunStatus,
  IssueComment,
  CreateCheckRunParams,
  UpdateCheckRunParams,
  CreateCommentParams,
  UpdateCommentParams,
  ListCommentsParams,
} from "./types"

// Test-only exports — only import these from test/dev code paths
export { resetMockGitHub, getAllCheckRuns, getAllComments } from "./mock-github-client"

/**
 * Get the GitHub client for the given installation.
 * Returns the real Octokit client when GitHub App credentials are configured,
 * otherwise falls back to the mock client for dev/test.
 */
export function getGitHubClient(installationId?: number): GitHubClient {
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY && installationId) {
    return new OctokitGitHubClient(installationId)
  }
  return getMockGitHubClient()
}
