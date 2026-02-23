/**
 * OctokitGitHubClient — production implementation of GitHubClient using
 * @octokit/rest authenticated as a GitHub App installation.
 */

import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"
import type { GitHubClient } from "./client"
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
} from "./types"

export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit

  constructor(installationId: number) {
    const appId = getRequiredEnv("GITHUB_APP_ID")
    const privateKey = getRequiredEnv("GITHUB_PRIVATE_KEY")
    this.octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId,
      },
    })
  }

  // --- Users ---

  async getUser(username: string): Promise<GitHubUser | null> {
    try {
      const { data } = await this.octokit.rest.users.getByUsername({ username })
      return {
        login: data.login,
        id: data.id,
        avatar_url: data.avatar_url,
        html_url: data.html_url,
        type: data.type as GitHubUser["type"],
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && err.status === 404) return null
      throw err
    }
  }

  // --- Org Membership ---

  async checkOrgMembership(org: string, username: string): Promise<OrgMembershipStatus> {
    try {
      await this.octokit.rest.orgs.checkMembershipForUser({ org, username })
      return "active"
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status
        if (status === 404 || status === 302) return "not_member"
      }
      throw err
    }
  }

  async getRepositoryPermissionLevel(
    owner: string,
    repo: string,
    username: string
  ): Promise<RepositoryPermissionLevel> {
    try {
      const { data } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      })
      const permission = data.permission
      if (
        permission === "admin" ||
        permission === "maintain" ||
        permission === "write" ||
        permission === "triage" ||
        permission === "read" ||
        permission === "none"
      ) {
        return permission
      }
      return "none"
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status
        if (status === 404) return "none"
      }
      throw err
    }
  }

  // --- Check Runs ---

  async createCheckRun(params: CreateCheckRunParams): Promise<CheckRun> {
    const { data } = await this.octokit.rest.checks.create({
      owner: params.owner,
      repo: params.repo,
      name: params.name,
      head_sha: params.head_sha,
      status: params.status,
      conclusion: params.conclusion,
      started_at: params.started_at,
      completed_at: params.completed_at,
      output: params.output,
    })
    return this.mapCheckRun(data)
  }

  async updateCheckRun(params: UpdateCheckRunParams): Promise<CheckRun> {
    const { data } = await this.octokit.rest.checks.update({
      owner: params.owner,
      repo: params.repo,
      check_run_id: params.check_run_id,
      status: params.status,
      conclusion: params.conclusion,
      completed_at: params.completed_at,
      output: params.output,
    })
    return this.mapCheckRun(data)
  }

  async getCheckRunForPr(
    owner: string,
    repo: string,
    headSha: string,
    checkName: string
  ): Promise<CheckRun | null> {
    const { data } = await this.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      check_name: checkName,
    })
    if (data.check_runs.length === 0) return null
    return this.mapCheckRun(data.check_runs[0])
  }

  async listCheckRunsForRef(owner: string, repo: string, ref: string): Promise<CheckRun[]> {
    const { data } = await this.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref,
    })
    return data.check_runs.map((c) => this.mapCheckRun(c))
  }

  // --- PR Comments ---

  async createComment(params: CreateCommentParams): Promise<IssueComment> {
    const { data } = await this.octokit.rest.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issue_number,
      body: params.body,
    })
    return this.mapComment(data)
  }

  async updateComment(params: UpdateCommentParams): Promise<IssueComment> {
    const { data } = await this.octokit.rest.issues.updateComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: params.comment_id,
      body: params.body,
    })
    return this.mapComment(data)
  }

  async listComments(params: ListCommentsParams): Promise<IssueComment[]> {
    const { data } = await this.octokit.rest.issues.listComments({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issue_number,
      per_page: 100,
    })
    return data.map((c) => this.mapComment(c))
  }

  async findBotComment(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueComment | null> {
    const allComments = await this.listComments({ owner, repo, issue_number: issueNumber })
    const botComment = allComments.find((c) => c.user.type === "Bot")
    return botComment ?? null
  }

  // --- Pull Requests ---

  async getPullRequestHeadSha(owner: string, repo: string, pullNumber: number): Promise<string> {
    const { data } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    })
    return data.head.sha
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequestRef | null> {
    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      })
      return {
        number: data.number,
        headSha: data.head.sha,
        authorLogin: data.user?.login ?? "",
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && err.status === 404) return null
      throw err
    }
  }

  async listOpenPullRequestsByAuthor(
    owner: string,
    repo: string,
    author: string
  ): Promise<PullRequestRef[]> {
    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 100,
    })

    return data
      .filter((pr) => pr.user?.login === author)
      .map((pr) => ({
        number: pr.number,
        headSha: pr.head.sha,
        authorLogin: pr.user?.login ?? "",
      }))
  }

  // --- Helpers ---

  private mapCheckRun(data: {
    id: number
    head_sha: string
    name: string
    status: string
    conclusion: string | null
    started_at: string | null
    completed_at: string | null
    output?: { title?: string | null; summary?: string | null } | null
    html_url: string | null
  }): CheckRun {
    return {
      id: data.id,
      head_sha: data.head_sha,
      name: data.name,
      status: data.status as CheckRun["status"],
      conclusion: (data.conclusion as CheckRun["conclusion"]) ?? null,
      started_at: data.started_at ?? new Date().toISOString(),
      completed_at: data.completed_at ?? null,
      output: {
        title: data.output?.title ?? "",
        summary: data.output?.summary ?? "",
      },
      html_url: data.html_url ?? "",
    }
  }

  private mapComment(data: {
    id: number
    body?: string | null
    user?: {
      login?: string | null
      id?: number | null
      avatar_url?: string | null
      html_url?: string | null
      type?: string | null
    } | null
    created_at?: string
    updated_at?: string
    html_url?: string
  }): IssueComment {
    const now = new Date().toISOString()
    return {
      id: data.id,
      body: data.body ?? "",
      user: {
        login: data.user?.login ?? "unknown",
        id: data.user?.id ?? 0,
        avatar_url: data.user?.avatar_url ?? "",
        html_url: data.user?.html_url ?? "",
        type: (data.user?.type as GitHubUser["type"]) ?? "User",
      },
      created_at: data.created_at ?? now,
      updated_at: data.updated_at ?? now,
      html_url: data.html_url ?? "",
    }
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}
