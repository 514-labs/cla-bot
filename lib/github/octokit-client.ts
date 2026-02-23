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
  CheckRun,
  CreateCheckRunParams,
  UpdateCheckRunParams,
  IssueComment,
  CreateCommentParams,
  UpdateCommentParams,
  ListCommentsParams,
} from "./types"

export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit

  constructor(installationId: number) {
    this.octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.GITHUB_APP_ID!,
        privateKey: process.env.GITHUB_PRIVATE_KEY!,
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
      const { status } = await this.octokit.rest.orgs.checkMembershipForUser({ org, username })
      // 204 = member, 302 = not member (redirects to 404 with Octokit)
      return status === 204 ? "active" : "not_member"
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status
        if (status === 404 || status === 302) return "not_member"
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

  // --- Helpers ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapCheckRun(data: any): CheckRun {
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
      html_url: data.html_url,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapComment(data: any): IssueComment {
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
      created_at: data.created_at,
      updated_at: data.updated_at,
      html_url: data.html_url,
    }
  }
}
