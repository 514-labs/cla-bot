/**
 * MockGitHubClient — in-memory implementation of the GitHubClient interface.
 *
 * GitHub users are a superset of our app users. Many GitHub users exist who
 * have never used our CLA app. The mock simulates this with a pool of
 * GitHub users, org memberships, check runs, and PR comments — all stored
 * in-memory and completely separate from the app's mock-db.
 */

import type { GitHubClient } from "./client"
import type {
  GitHubUser,
  OrgMembershipStatus,
  CheckRun,
  CreateCheckRunParams,
  UpdateCheckRunParams,
  IssueComment,
  CreateCommentParams,
  UpdateCommentParams,
  ListCommentsParams,
} from "./types"

// ==============================
// GitHub user pool (superset of app users)
// ==============================

const GITHUB_USERS: GitHubUser[] = [
  {
    login: "orgadmin",
    id: 1001,
    avatar_url: "https://avatars.githubusercontent.com/u/1001",
    html_url: "https://github.com/orgadmin",
    type: "User",
  },
  {
    login: "contributor1",
    id: 1002,
    avatar_url: "https://avatars.githubusercontent.com/u/1002",
    html_url: "https://github.com/contributor1",
    type: "User",
  },
  {
    login: "dev-sarah",
    id: 1003,
    avatar_url: "https://avatars.githubusercontent.com/u/1003",
    html_url: "https://github.com/dev-sarah",
    type: "User",
  },
  {
    login: "new-contributor",
    id: 1004,
    avatar_url: "https://avatars.githubusercontent.com/u/1004",
    html_url: "https://github.com/new-contributor",
    type: "User",
  },
  {
    login: "random-dev",
    id: 1005,
    avatar_url: "https://avatars.githubusercontent.com/u/1005",
    html_url: "https://github.com/random-dev",
    type: "User",
  },
  {
    login: "external-contributor",
    id: 1006,
    avatar_url: "https://avatars.githubusercontent.com/u/1006",
    html_url: "https://github.com/external-contributor",
    type: "User",
  },
]

// Bot user for our GitHub App
const BOT_USER: GitHubUser = {
  login: "cla-bot[bot]",
  id: 9000,
  avatar_url: "https://avatars.githubusercontent.com/in/1",
  html_url: "https://github.com/apps/cla-bot",
  type: "Bot",
}

// ==============================
// Org membership (who is a member of which GitHub org)
// ==============================

type OrgMembership = { org: string; username: string }

const INITIAL_ORG_MEMBERSHIPS: OrgMembership[] = [
  { org: "fiveonefour", username: "orgadmin" },
  { org: "moose-stack", username: "orgadmin" },
]

// ==============================
// In-memory stores for GitHub API state
// ==============================

let githubUsers: GitHubUser[] = [...GITHUB_USERS]
let orgMemberships: OrgMembership[] = [...INITIAL_ORG_MEMBERSHIPS]
let checkRuns: CheckRun[] = []
let comments: (IssueComment & { owner: string; repo: string; issue_number: number })[] = []
let nextCheckRunId = 1
let nextCommentId = 1

// ==============================
// Mock implementation
// ==============================

export class MockGitHubClient implements GitHubClient {
  // --- Users ---

  async getUser(username: string): Promise<GitHubUser | null> {
    return githubUsers.find((u) => u.login === username) ?? null
  }

  // --- Org Membership ---

  async checkOrgMembership(org: string, username: string): Promise<OrgMembershipStatus> {
    const isMember = orgMemberships.some(
      (m) => m.org === org && m.username === username
    )
    return isMember ? "active" : "not_member"
  }

  // --- Check Runs ---

  async createCheckRun(params: CreateCheckRunParams): Promise<CheckRun> {
    const now = new Date().toISOString()
    const checkRun: CheckRun = {
      id: nextCheckRunId++,
      head_sha: params.head_sha,
      name: params.name,
      status: params.status,
      conclusion: params.conclusion ?? null,
      started_at: params.started_at ?? now,
      completed_at: params.completed_at ?? (params.status === "completed" ? now : null),
      output: params.output ?? { title: "", summary: "" },
      html_url: `https://github.com/${params.owner}/${params.repo}/runs/${nextCheckRunId - 1}`,
    }
    // Store with owner/repo metadata for lookups
    checkRuns.push(checkRun)
    // Also store the association
    checkRunMeta.push({
      id: checkRun.id,
      owner: params.owner,
      repo: params.repo,
    })
    return { ...checkRun }
  }

  async updateCheckRun(params: UpdateCheckRunParams): Promise<CheckRun> {
    const idx = checkRuns.findIndex((c) => c.id === params.check_run_id)
    if (idx === -1) throw new Error(`Check run ${params.check_run_id} not found`)
    const existing = checkRuns[idx]
    if (params.status !== undefined) existing.status = params.status
    if (params.conclusion !== undefined) existing.conclusion = params.conclusion
    if (params.completed_at !== undefined) existing.completed_at = params.completed_at
    if (params.output !== undefined) existing.output = params.output
    if (params.status === "completed" && !existing.completed_at) {
      existing.completed_at = new Date().toISOString()
    }
    return { ...existing }
  }

  async getCheckRunForPr(
    owner: string,
    repo: string,
    headSha: string,
    checkName: string
  ): Promise<CheckRun | null> {
    const meta = checkRunMeta.filter((m) => m.owner === owner && m.repo === repo)
    const ids = new Set(meta.map((m) => m.id))
    const match = checkRuns.find(
      (c) => ids.has(c.id) && c.head_sha === headSha && c.name === checkName
    )
    return match ? { ...match } : null
  }

  async listCheckRunsForRef(owner: string, repo: string, ref: string): Promise<CheckRun[]> {
    const meta = checkRunMeta.filter((m) => m.owner === owner && m.repo === repo)
    const ids = new Set(meta.map((m) => m.id))
    return checkRuns
      .filter((c) => ids.has(c.id) && c.head_sha === ref)
      .map((c) => ({ ...c }))
  }

  // --- PR Comments ---

  async createComment(params: CreateCommentParams): Promise<IssueComment> {
    const now = new Date().toISOString()
    const comment: IssueComment & { owner: string; repo: string; issue_number: number } = {
      id: nextCommentId++,
      body: params.body,
      user: { ...BOT_USER },
      created_at: now,
      updated_at: now,
      html_url: `https://github.com/${params.owner}/${params.repo}/pull/${params.issue_number}#issuecomment-${nextCommentId - 1}`,
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issue_number,
    }
    comments.push(comment)
    return { ...comment, owner: undefined, repo: undefined, issue_number: undefined } as IssueComment
  }

  async updateComment(params: UpdateCommentParams): Promise<IssueComment> {
    const idx = comments.findIndex((c) => c.id === params.comment_id)
    if (idx === -1) throw new Error(`Comment ${params.comment_id} not found`)
    comments[idx].body = params.body
    comments[idx].updated_at = new Date().toISOString()
    const { owner, repo, issue_number, ...rest } = comments[idx]
    return { ...rest }
  }

  async listComments(params: ListCommentsParams): Promise<IssueComment[]> {
    return comments
      .filter(
        (c) =>
          c.owner === params.owner &&
          c.repo === params.repo &&
          c.issue_number === params.issue_number
      )
      .map(({ owner, repo, issue_number, ...rest }) => ({ ...rest }))
  }

  async findBotComment(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueComment | null> {
    const prComments = comments.filter(
      (c) =>
        c.owner === owner &&
        c.repo === repo &&
        c.issue_number === issueNumber &&
        c.user.type === "Bot"
    )
    if (prComments.length === 0) return null
    const latest = prComments[prComments.length - 1]
    const { owner: _o, repo: _r, issue_number: _i, ...rest } = latest
    return { ...rest }
  }
}

// Internal metadata to associate check runs with repos
let checkRunMeta: { id: number; owner: string; repo: string }[] = []

// ==============================
// State management for testing
// ==============================

/** Reset all mock GitHub state. Call this in test setup. */
export function resetMockGitHub() {
  githubUsers = [...GITHUB_USERS]
  orgMemberships = [...INITIAL_ORG_MEMBERSHIPS]
  checkRuns = []
  checkRunMeta = []
  comments = []
  nextCheckRunId = 1
  nextCommentId = 1
}

/** Get all check runs (for debugging / test inspection). */
export function getAllCheckRuns() {
  return checkRuns.map((c) => ({ ...c }))
}

/** Get all comments (for debugging / test inspection). */
export function getAllComments() {
  return comments.map(({ owner, repo, issue_number, ...rest }) => ({
    ...rest,
    owner,
    repo,
    issue_number,
  }))
}

/** Get the singleton instance. */
let instance: MockGitHubClient | null = null
export function getMockGitHubClient(): MockGitHubClient {
  if (!instance) instance = new MockGitHubClient()
  return instance
}
