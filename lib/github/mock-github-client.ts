/**
 * MockGitHubClient — in-memory implementation of the GitHubClient interface.
 *
 * GitHub users are a superset of our app users. Many GitHub users exist who
 * have never used our CLA app. The mock simulates this with a pool of
 * GitHub users, org memberships, check runs, and PR comments — all stored
 * in-memory and completely separate from app database state.
 */

import type { GitHubClient } from "./client"
import { findLatestManagedClaBotComment } from "./comment-ownership"
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
  DeleteCommentParams,
  ListCommentsParams,
  PullRequestRef,
  OpenOrganizationPullRequestRef,
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

type RepoPermission = {
  owner: string
  repo: string
  username: string
  permission: RepositoryPermissionLevel
}

const INITIAL_REPO_PERMISSIONS: RepoPermission[] = [
  { owner: "fiveonefour", repo: "sdk", username: "orgadmin", permission: "admin" },
  { owner: "fiveonefour", repo: "sdk", username: "dev-sarah", permission: "maintain" },
  { owner: "moose-stack", repo: "sdk", username: "orgadmin", permission: "admin" },
]

// ==============================
// Observability + fault injection (dev/test only)
// ==============================

export type MockGitHubCall = {
  seq: number
  method: string
  args: unknown[]
  /** Epoch ms when the call started. */
  at: number
  durationMs: number
  /** Error message when the call rejected (injected or real), else null. */
  error: string | null
}

export type MockGitHubFailure = {
  /** HTTP-like status attached to the thrown error (mirrors Octokit RequestError). */
  status?: number
  message?: string
  /** How many calls to fail before clearing; omit for "every call until reset". */
  times?: number
}

export type MockGitHubConfig = {
  /** Artificial delay applied to every mock call, to make serial chains visible. */
  latencyMs: number
  failures: Record<string, MockGitHubFailure>
}

const MAX_CALL_LOG = 1000
/** Upper bound for injected latency so a bad request can't park the server. */
const MAX_LATENCY_MS = 10_000

function clampLatency(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.floor(value), MAX_LATENCY_MS)
}

function defaultLatencyMs(): number {
  const raw = process.env.MOCK_GITHUB_LATENCY_MS
  return clampLatency(raw ? Number.parseInt(raw, 10) : 0)
}

type MockState = {
  latencyMs: number
  /** Keyed by GitHubClient method name; a Map avoids prototype-key writes. */
  failures: Map<string, MockGitHubFailure>
}

let callLog: MockGitHubCall[] = []
let callSeq = 0
let mockConfig: MockState = { latencyMs: defaultLatencyMs(), failures: new Map() }

/** Names of the GitHubClient methods the mock implements (the only valid failure targets). */
function knownMethodNames(): Set<string> {
  return new Set(
    Object.getOwnPropertyNames(MockGitHubClient.prototype).filter(
      (name) =>
        name !== "constructor" &&
        typeof (MockGitHubClient.prototype as unknown as Record<string, unknown>)[name] ===
          "function"
    )
  )
}

export class MockGitHubRequestError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "MockGitHubRequestError"
    this.status = status
  }
}

/**
 * Set artificial latency and/or failures. `null` for a method clears its failure.
 * Latency is clamped to MAX_LATENCY_MS; unknown method names are rejected.
 */
export function configureMockGitHub(config: {
  latencyMs?: number
  failures?: Record<string, MockGitHubFailure | null>
}) {
  if (typeof config.latencyMs === "number") {
    mockConfig.latencyMs = clampLatency(config.latencyMs)
  }
  if (config.failures) {
    const known = knownMethodNames()
    for (const [method, failure] of Object.entries(config.failures)) {
      if (!known.has(method)) {
        throw new Error(
          `Unknown mock GitHub method "${method}". Valid: ${[...known].sort().join(", ")}`
        )
      }
      if (failure === null) {
        mockConfig.failures.delete(method)
      } else {
        mockConfig.failures.set(method, {
          ...(typeof failure.status === "number" ? { status: failure.status } : {}),
          ...(typeof failure.message === "string" ? { message: failure.message } : {}),
          ...(typeof failure.times === "number" ? { times: failure.times } : {}),
        })
      }
    }
  }
}

export function getMockGitHubConfig(): MockGitHubConfig {
  return {
    latencyMs: mockConfig.latencyMs,
    failures: Object.fromEntries(
      [...mockConfig.failures].map(([method, failure]) => [method, { ...failure }])
    ),
  }
}

/** Every call made through the mock client since the last reset, in order. */
export function getMockGitHubCallLog(): MockGitHubCall[] {
  return callLog.map((call) => ({ ...call, args: [...call.args] }))
}

export function clearMockGitHubCallLog() {
  callLog = []
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function takeInjectedFailure(method: string): MockGitHubFailure | null {
  const failure = mockConfig.failures.get(method)
  if (!failure) return null
  if (typeof failure.times === "number") {
    if (failure.times <= 1) {
      mockConfig.failures.delete(method)
    } else {
      failure.times -= 1
    }
  }
  return failure
}

/**
 * Wrap a client so every method call is recorded, delayed by the configured
 * latency, and subject to injected failures. Non-function properties pass through.
 */
function instrument(client: MockGitHubClient): MockGitHubClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== "function" || typeof property !== "string") return value

      return async (...args: unknown[]) => {
        const startedAt = Date.now()
        const entry: MockGitHubCall = {
          seq: ++callSeq,
          method: property,
          args,
          at: startedAt,
          durationMs: 0,
          error: null,
        }
        callLog.push(entry)
        if (callLog.length > MAX_CALL_LOG) callLog.splice(0, callLog.length - MAX_CALL_LOG)

        try {
          if (mockConfig.latencyMs > 0) await sleep(mockConfig.latencyMs)
          const failure = takeInjectedFailure(property)
          if (failure) {
            throw new MockGitHubRequestError(
              failure.message ?? `Injected mock GitHub failure for ${property}`,
              failure.status ?? 500
            )
          }
          return await (value as (...callArgs: unknown[]) => Promise<unknown>).apply(target, args)
        } catch (error) {
          entry.error = error instanceof Error ? error.message : String(error)
          throw error
        } finally {
          entry.durationMs = Date.now() - startedAt
        }
      }
    },
  })
}

// ==============================
// In-memory stores for GitHub API state
// ==============================

let githubUsers: GitHubUser[] = [...GITHUB_USERS]
let orgMemberships: OrgMembership[] = [...INITIAL_ORG_MEMBERSHIPS]
let repoPermissions: RepoPermission[] = [...INITIAL_REPO_PERMISSIONS]
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
    const isMember = orgMemberships.some((m) => m.org === org && m.username === username)
    return isMember ? "active" : "not_member"
  }

  async getRepositoryPermissionLevel(
    owner: string,
    repo: string,
    username: string
  ): Promise<RepositoryPermissionLevel> {
    const match = repoPermissions.find(
      (entry) => entry.owner === owner && entry.repo === repo && entry.username === username
    )
    return match?.permission ?? "none"
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
    return checkRuns.filter((c) => ids.has(c.id) && c.head_sha === ref).map((c) => ({ ...c }))
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
    return {
      ...comment,
      owner: undefined,
      repo: undefined,
      issue_number: undefined,
    } as IssueComment
  }

  async updateComment(params: UpdateCommentParams): Promise<IssueComment> {
    const idx = comments.findIndex((c) => c.id === params.comment_id)
    if (idx === -1) throw new Error(`Comment ${params.comment_id} not found`)
    comments[idx].body = params.body
    comments[idx].updated_at = new Date().toISOString()
    const { owner, repo, issue_number, ...rest } = comments[idx]
    return { ...rest }
  }

  async deleteComment(params: DeleteCommentParams): Promise<void> {
    const idx = comments.findIndex((c) => c.id === params.comment_id)
    if (idx === -1) throw new Error(`Comment ${params.comment_id} not found`)
    comments.splice(idx, 1)
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
    const prComments = comments
      .filter((c) => c.owner === owner && c.repo === repo && c.issue_number === issueNumber)
      .map(({ owner: _o, repo: _r, issue_number: _i, ...rest }) => ({ ...rest }))

    return findLatestManagedClaBotComment(prComments)
  }

  // --- Pull Requests ---

  async getPullRequestHeadSha(owner: string, repo: string, pullNumber: number): Promise<string> {
    const fromKnownPr = pullRequests.find(
      (pr) => pr.owner === owner && pr.repo === repo && pr.number === pullNumber
    )
    if (fromKnownPr) return fromKnownPr.headSha

    // Fallback: derive from latest check run for this repo in mock preview mode.
    const meta = checkRunMeta
      .filter((m) => m.owner === owner && m.repo === repo)
      .slice()
      .reverse()
    for (const m of meta) {
      const match = checkRuns.find((c) => c.id === m.id)
      if (match) return match.head_sha
    }

    throw new Error(`Pull request #${pullNumber} not found in mock state`)
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequestRef | null> {
    const pullRequest = pullRequests.find(
      (pr) => pr.owner === owner && pr.repo === repo && pr.number === pullNumber
    )
    if (!pullRequest) return null

    return {
      number: pullRequest.number,
      headSha: pullRequest.headSha,
      authorLogin: pullRequest.authorLogin,
      authorId: pullRequest.authorId,
    }
  }

  async listOpenPullRequestsByAuthor(
    owner: string,
    repo: string,
    author: string
  ): Promise<PullRequestRef[]> {
    return pullRequests
      .filter((pr) => pr.owner === owner && pr.repo === repo && pr.authorLogin === author)
      .map((pr) => ({
        number: pr.number,
        headSha: pr.headSha,
        authorLogin: pr.authorLogin,
        authorId: pr.authorId,
      }))
  }

  async listOpenPullRequestsForOrganization(
    owner: string
  ): Promise<OpenOrganizationPullRequestRef[]> {
    return pullRequests
      .filter((pr) => pr.owner === owner)
      .map((pr) => ({
        repoName: pr.repo,
        number: pr.number,
        headSha: pr.headSha,
        authorLogin: pr.authorLogin,
        authorId: pr.authorId,
      }))
  }
}

// Internal metadata to associate check runs with repos
let checkRunMeta: { id: number; owner: string; repo: string }[] = []
let pullRequests: {
  owner: string
  repo: string
  number: number
  headSha: string
  authorLogin: string
  authorId?: number
}[] = []

// ==============================
// State management for testing
// ==============================

/**
 * Reset all mock GitHub state, including the call log and any injected
 * latency/failures. Call this in test setup.
 *
 * Note: this resets the mock in the *current process*. When the app runs in a
 * separate dev server, use the `/api/test-support` endpoint instead.
 */
export function resetMockGitHub() {
  githubUsers = [...GITHUB_USERS]
  orgMemberships = [...INITIAL_ORG_MEMBERSHIPS]
  repoPermissions = [...INITIAL_REPO_PERMISSIONS]
  checkRuns = []
  checkRunMeta = []
  comments = []
  pullRequests = []
  nextCheckRunId = 1
  nextCommentId = 1
  callLog = []
  callSeq = 0
  mockConfig = { latencyMs: defaultLatencyMs(), failures: new Map() }
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

/**
 * Track PR metadata in mock mode so /recheck and sign flows can resolve head SHAs.
 */
export function upsertMockPullRequest(data: {
  owner: string
  repo: string
  number: number
  headSha: string
  authorLogin: string
  authorId?: number
}) {
  const authorId =
    data.authorId ?? githubUsers.find((user) => user.login === data.authorLogin)?.id ?? undefined
  const normalized = { ...data, authorId }
  const idx = pullRequests.findIndex(
    (pr) => pr.owner === data.owner && pr.repo === data.repo && pr.number === data.number
  )

  if (idx >= 0) {
    pullRequests[idx] = normalized
    return
  }
  pullRequests.push(normalized)
}

/** Get the singleton (instrumented) instance. */
let instance: MockGitHubClient | null = null
export function getMockGitHubClient(): MockGitHubClient {
  if (!instance) instance = instrument(new MockGitHubClient())
  return instance
}
