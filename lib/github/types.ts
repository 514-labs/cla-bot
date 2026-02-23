/**
 * GitHub API types — subset of GitHub's API that our CLA bot uses.
 * These mirror the shapes from @octokit/rest so the mock and prod
 * implementations are interchangeable.
 */

// --- GitHub Users ---
export type GitHubUser = {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: "User" | "Organization" | "Bot"
}

// --- Org Membership ---
export type OrgMembershipStatus = "active" | "pending" | "not_member"

// --- Check Runs (GitHub Checks API) ---
export type CheckRunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"

export type CheckRunStatus = "queued" | "in_progress" | "completed"

export type CheckRun = {
  id: number
  head_sha: string
  name: string
  status: CheckRunStatus
  conclusion: CheckRunConclusion | null
  started_at: string
  completed_at: string | null
  output: {
    title: string
    summary: string
  }
  html_url: string
}

export type CreateCheckRunParams = {
  owner: string
  repo: string
  name: string
  head_sha: string
  status: CheckRunStatus
  conclusion?: CheckRunConclusion
  started_at?: string
  completed_at?: string
  output?: {
    title: string
    summary: string
  }
}

export type UpdateCheckRunParams = {
  owner: string
  repo: string
  check_run_id: number
  status?: CheckRunStatus
  conclusion?: CheckRunConclusion
  completed_at?: string
  output?: {
    title: string
    summary: string
  }
}

// --- PR Comments (Issues API) ---
export type IssueComment = {
  id: number
  body: string
  user: GitHubUser
  created_at: string
  updated_at: string
  html_url: string
}

export type CreateCommentParams = {
  owner: string
  repo: string
  issue_number: number
  body: string
}

export type UpdateCommentParams = {
  owner: string
  repo: string
  comment_id: number
  body: string
}

export type ListCommentsParams = {
  owner: string
  repo: string
  issue_number: number
}

// --- Pull Requests ---
export type PullRequestRef = {
  number: number
  headSha: string
  authorLogin: string
}
