/**
 * GitHub client factory.
 *
 * In production with real env vars, this would return an Octokit-based client
 * authenticated as a GitHub App installation. For now (and in tests), it
 * returns the mock client.
 *
 * Production implementation would look like:
 *
 *   import { Octokit } from "@octokit/rest"
 *   import { createAppAuth } from "@octokit/auth-app"
 *
 *   const octokit = new Octokit({
 *     authStrategy: createAppAuth,
 *     auth: {
 *       appId: process.env.GITHUB_APP_ID,
 *       privateKey: process.env.GITHUB_PRIVATE_KEY,
 *       installationId: installationId, // per-org
 *     },
 *   })
 *
 * The OctokitGitHubClient would wrap octokit.rest.checks.create(),
 * octokit.rest.issues.createComment(), octokit.rest.orgs.checkMembershipForUser(), etc.
 */

import type { GitHubClient } from "./client"
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

export { resetMockGitHub, getAllCheckRuns, getAllComments } from "./mock-github-client"

/**
 * Get the GitHub client for the given installation.
 * In production, installationId would be used to authenticate as the GitHub App.
 */
export function getGitHubClient(_installationId?: number): GitHubClient {
  // TODO: when GITHUB_APP_ID and GITHUB_PRIVATE_KEY are set, return OctokitGitHubClient
  return getMockGitHubClient()
}
