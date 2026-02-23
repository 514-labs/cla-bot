/**
 * GitHubClient — interface that both the real Octokit-based client and the
 * mock implementation satisfy.
 *
 * Production:  getGitHubClient() returns an OctokitGitHubClient
 * Development: getGitHubClient() returns a MockGitHubClient
 *
 * The webhook handler and sign API only import this interface, never Octokit directly.
 */

import type {
  GitHubUser,
  OrgMembershipStatus,
  RepositoryPermissionLevel,
  CheckRun,
  CreateCheckRunParams,
  UpdateCheckRunParams,
  IssueComment,
  CreateCommentParams,
  UpdateCommentParams,
  ListCommentsParams,
  PullRequestRef,
  OpenOrganizationPullRequestRef,
} from "./types"

export interface GitHubClient {
  // --- Users ---
  /** Get a GitHub user by username. Returns null if not found. */
  getUser(username: string): Promise<GitHubUser | null>

  // --- Org Membership ---
  /** Check if a GitHub user is a member of an organization. */
  checkOrgMembership(org: string, username: string): Promise<OrgMembershipStatus>

  /** Get the caller-visible collaborator permission level for a repo user. */
  getRepositoryPermissionLevel(
    owner: string,
    repo: string,
    username: string
  ): Promise<RepositoryPermissionLevel>

  // --- Check Runs ---
  /** Create a new check run on a commit. */
  createCheckRun(params: CreateCheckRunParams): Promise<CheckRun>

  /** Update an existing check run. */
  updateCheckRun(params: UpdateCheckRunParams): Promise<CheckRun>

  /** Find a check run by name on a specific PR (commit SHA). */
  getCheckRunForPr(
    owner: string,
    repo: string,
    headSha: string,
    checkName: string
  ): Promise<CheckRun | null>

  /** List all check runs we created for a repo + PR number combo. */
  listCheckRunsForRef(owner: string, repo: string, ref: string): Promise<CheckRun[]>

  // --- PR Comments ---
  /** Create a comment on a PR/issue. */
  createComment(params: CreateCommentParams): Promise<IssueComment>

  /** Update an existing comment. */
  updateComment(params: UpdateCommentParams): Promise<IssueComment>

  /** List all comments on a PR/issue. */
  listComments(params: ListCommentsParams): Promise<IssueComment[]>

  /** Find the bot's existing comment on a PR (to update instead of creating a new one). */
  findBotComment(owner: string, repo: string, issueNumber: number): Promise<IssueComment | null>

  // --- Pull Requests ---
  /** Get the current head SHA for a pull request. */
  getPullRequestHeadSha(owner: string, repo: string, pullNumber: number): Promise<string>

  /** Get open or closed pull request metadata by number. */
  getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequestRef | null>

  /** List open pull requests created by a specific author. */
  listOpenPullRequestsByAuthor(
    owner: string,
    repo: string,
    author: string
  ): Promise<PullRequestRef[]>

  /** List open pull requests across repositories for an organization installation. */
  listOpenPullRequestsForOrganization(owner: string): Promise<OpenOrganizationPullRequestRef[]>
}
