/**
 * GitHub Webhook handler for CLA Bot.
 *
 * Production behavior:
 *   - Verifies x-hub-signature-256 using GITHUB_WEBHOOK_SECRET.
 *   - Uses installation-scoped Octokit client for checks/comments/membership.
 *   - Persists installation activation state and installation IDs.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getGitHubClient, upsertMockPullRequest } from "@/lib/github"
import type { GitHubClient } from "@/lib/github/client"
import type { CheckRun, CheckRunConclusion } from "@/lib/github/types"
import {
  getOrganizationBySlug,
  getOrganizationByGithubAccountId,
  getOrganizationByInstallationId,
  updateOrganizationSlug,
  isBypassAccountForOrg,
  getSignatureStatusByGithubId,
  getSignatureStatusByUsername,
  createOrganization,
  setOrganizationActive,
  updateOrganizationInstallationId,
  upsertUser,
  reserveWebhookDelivery,
  createAuditEvent,
} from "@/lib/db/queries"
import {
  CLA_BOT_COMMENT_SIGNATURE,
  generateUnsignedComment,
  isClaBotManagedComment,
} from "@/lib/pr-comment-template"
import { verifyWebhookSignatureFromEnv } from "@/lib/github/webhook-signature"
import { sanitizeForLog, sanitizeForLogOrNull } from "@/lib/security/log"

const CHECK_NAME = "CLA Bot / Contributor License Agreement"

type InstallationPayload = {
  action: string
  installation?: {
    id?: number
    account?: {
      login?: string
      id?: number
      type?: "Organization" | "User"
      avatar_url?: string
    }
  }
  sender?: {
    id?: number
    login?: string
    avatar_url?: string
  }
}

type PullRequestPayload = {
  action?: string
  number?: number
  installation?: { id?: number }
  sender?: {
    login?: string
    id?: number
    type?: string
  }
  pull_request?: {
    user?: { login?: string; id?: number; type?: string }
    head?: { sha?: string; ref?: string }
    base?: { ref?: string }
    author_association?: string
  }
  repository?: {
    name?: string
    full_name?: string
    owner?: { login?: string }
  }
}

type IssueCommentPayload = {
  action?: string
  installation?: { id?: number }
  comment?: {
    body?: string
    user?: { login?: string }
  }
  issue?: {
    number?: number
    user?: { login?: string; id?: number }
    pull_request?: { url?: string }
  }
  repository?: {
    name?: string
    owner?: { login?: string }
  }
}

type MergeGroupPayload = {
  action?: string
  installation?: { id?: number }
  merge_group?: {
    head_sha?: string
    head_ref?: string
    base_sha?: string
    base_ref?: string
  }
  repository?: {
    name?: string
    owner?: { login?: string }
  }
}

type CheckSuitePayload = {
  action?: string
  installation?: { id?: number }
  check_suite?: {
    head_sha?: string
    head_branch?: string | null
  }
  repository?: {
    name?: string
    owner?: { login?: string }
  }
}

type OrganizationPayload = {
  action?: string
  organization?: {
    id?: number
    login?: string
  }
  changes?: {
    login?: {
      from?: string
    }
  }
}

type PingPayload = {
  zen?: string
  hook_id?: number
  hook?: {
    id?: number
  }
}

type GitHubAccountType = "organization" | "user"

export async function POST(request: NextRequest) {
  const event = request.headers.get("x-github-event")
  if (!event) {
    return NextResponse.json({ error: "Missing x-github-event header" }, { status: 400 })
  }

  const deliveryId = request.headers.get("x-github-delivery")
  if (process.env.NODE_ENV === "production" && !deliveryId) {
    return NextResponse.json({ error: "Missing x-github-delivery header" }, { status: 400 })
  }

  const rawBody = await request.text()
  const verificationError = verifyWebhookSignatureFromEnv(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    "GITHUB_WEBHOOK_SECRET"
  )
  if (verificationError) return verificationError

  if (deliveryId) {
    const isNewDelivery = await reserveWebhookDelivery(deliveryId, event)
    if (!isNewDelivery) {
      return NextResponse.json({ message: "Duplicate delivery ignored", deliveryId })
    }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  if (event === "ping") {
    const pingPayload = payload as PingPayload
    return NextResponse.json({
      message: "Webhook ping received",
      zen: pingPayload.zen ?? null,
      hookId: pingPayload.hook_id ?? pingPayload.hook?.id ?? null,
    })
  }

  const baseUrl = getBaseUrl(request)

  if (event === "installation") {
    return handleInstallation(payload as InstallationPayload)
  }

  if (event === "installation_repositories") {
    return handleInstallationRepositories(payload as InstallationPayload)
  }

  if (event === "organization") {
    return handleOrganization(payload as OrganizationPayload)
  }

  if (event === "pull_request") {
    const prPayload = payload as PullRequestPayload
    const action = prPayload.action
    if (!action || !["opened", "synchronize", "reopened"].includes(action)) {
      return NextResponse.json({ message: "PR action ignored", action: action ?? "unknown" })
    }

    const orgSlug = prPayload.repository?.owner?.login
    const repoName = prPayload.repository?.name
    const prNumber = prPayload.number
    const prAuthor = prPayload.pull_request?.user?.login
    const prAuthorId = prPayload.pull_request?.user?.id
    const headSha = prPayload.pull_request?.head?.sha
    const installationId = prPayload.installation?.id

    if (!orgSlug || !repoName || !prNumber || !prAuthor || !headSha) {
      return NextResponse.json(
        { error: "Missing required pull_request payload fields" },
        { status: 400 }
      )
    }

    if (isDependabotLikePullRequest(prPayload)) {
      const author = prPayload.pull_request?.user
      const sender = prPayload.sender
      const headRef = prPayload.pull_request?.head?.ref ?? null
      console.info("[webhook][dependabot-like] pull_request event received", {
        deliveryId: sanitizeForLogOrNull(deliveryId),
        action: sanitizeForLog(action),
        installationId: prPayload.installation?.id ?? null,
        repository: {
          owner: sanitizeForLog(orgSlug),
          name: sanitizeForLog(repoName),
          fullName: sanitizeForLogOrNull(prPayload.repository?.full_name),
        },
        prNumber,
        author: {
          login: sanitizeForLogOrNull(author?.login),
          id: author?.id ?? null,
          type: sanitizeForLogOrNull(author?.type),
        },
        sender: {
          login: sanitizeForLogOrNull(sender?.login),
          id: sender?.id ?? null,
          type: sanitizeForLogOrNull(sender?.type),
        },
        head: {
          ref: sanitizeForLogOrNull(headRef),
          sha: sanitizeForLog(headSha.slice(0, 12)),
        },
        baseRef: sanitizeForLogOrNull(prPayload.pull_request?.base?.ref),
        authorAssociation: sanitizeForLogOrNull(prPayload.pull_request?.author_association),
        heuristics: {
          authorLoginLooksDependabot: (author?.login ?? "").toLowerCase().includes("dependabot"),
          senderLoginLooksDependabot: (sender?.login ?? "").toLowerCase().includes("dependabot"),
          authorLooksBot:
            author?.type === "Bot" || (author?.login ?? "").toLowerCase().endsWith("[bot]"),
          senderLooksBot:
            sender?.type === "Bot" || (sender?.login ?? "").toLowerCase().endsWith("[bot]"),
          headRefLooksDependabot: (headRef ?? "").toLowerCase().startsWith("dependabot/"),
        },
      })
    }

    if (process.env.NODE_ENV !== "production") {
      upsertMockPullRequest({
        owner: orgSlug,
        repo: repoName,
        number: prNumber,
        headSha,
        authorLogin: prAuthor,
        authorId: prAuthorId,
      })
    }

    return handlePrCheck({
      orgSlug,
      repoName,
      prNumber,
      prAuthor,
      prAuthorId,
      headSha,
      baseUrl,
      installationId,
    })
  }

  if (event === "merge_group") {
    const mgPayload = payload as MergeGroupPayload
    if (mgPayload.action !== "checks_requested") {
      return NextResponse.json({
        message: "Merge group action ignored",
        action: mgPayload.action ?? "unknown",
      })
    }

    const orgSlug = mgPayload.repository?.owner?.login
    const repoName = mgPayload.repository?.name
    const headSha = mgPayload.merge_group?.head_sha
    const installationId = mgPayload.installation?.id

    if (!orgSlug || !repoName || !headSha) {
      return NextResponse.json(
        { error: "Missing required merge_group payload fields" },
        { status: 400 }
      )
    }

    const org = await getOrganizationBySlug(orgSlug)
    const resolvedInstallationId = installationId ?? org?.installationId ?? undefined

    if (!resolvedInstallationId && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: `Missing installation ID for organization "${orgSlug}"` },
        { status: 424 }
      )
    }

    let github: ReturnType<typeof getGitHubClient>
    try {
      github = getGitHubClient(resolvedInstallationId)
    } catch (err) {
      console.error("Failed to initialize GitHub client for merge_group:", err)
      return NextResponse.json({ error: "GitHub client is not configured" }, { status: 500 })
    }

    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "CLA: Merge queue",
        summary: `CLA compliance was verified on the original pull request. Merge queue check passed.`,
      },
    })

    return NextResponse.json({
      message: `Merge group check passed for ${orgSlug}/${repoName}.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      mergeGroup: true,
    })
  }

  if (event === "check_suite") {
    const csPayload = payload as CheckSuitePayload
    if (csPayload.action !== "requested") {
      return NextResponse.json({
        message: "Check suite action ignored",
        action: csPayload.action ?? "unknown",
      })
    }

    const headBranch = csPayload.check_suite?.head_branch ?? ""
    if (!headBranch.startsWith("gh-readonly-queue/")) {
      return NextResponse.json({ message: "Check suite ignored for non-merge-queue branch" })
    }

    const orgSlug = csPayload.repository?.owner?.login
    const repoName = csPayload.repository?.name
    const headSha = csPayload.check_suite?.head_sha
    const installationId = csPayload.installation?.id

    if (!orgSlug || !repoName || !headSha) {
      return NextResponse.json(
        { error: "Missing required check_suite payload fields" },
        { status: 400 }
      )
    }

    const org = await getOrganizationBySlug(orgSlug)
    const resolvedInstallationId = installationId ?? org?.installationId ?? undefined

    if (!resolvedInstallationId && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: `Missing installation ID for organization "${orgSlug}"` },
        { status: 424 }
      )
    }

    let github: ReturnType<typeof getGitHubClient>
    try {
      github = getGitHubClient(resolvedInstallationId)
    } catch (err) {
      console.error("Failed to initialize GitHub client for check_suite merge queue:", err)
      return NextResponse.json({ error: "GitHub client is not configured" }, { status: 500 })
    }

    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "CLA: Merge queue",
        summary: `CLA compliance was verified on the original pull request. Merge queue check passed.`,
      },
    })

    return NextResponse.json({
      message: `Merge queue check suite passed for ${orgSlug}/${repoName}.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      mergeQueue: true,
    })
  }

  if (event === "issue_comment") {
    const commentPayload = payload as IssueCommentPayload
    if (commentPayload.action !== "created") {
      return NextResponse.json({ message: "Ignored non-created comment" })
    }

    const body = commentPayload.comment?.body ?? ""
    if (!body.trim().toLowerCase().startsWith("/recheck")) {
      return NextResponse.json({ message: "Not a /recheck command" })
    }
    if (!commentPayload.issue?.pull_request) {
      return NextResponse.json({ message: "Ignored /recheck on non-PR issue" })
    }

    const orgSlug = commentPayload.repository?.owner?.login
    const repoName = commentPayload.repository?.name
    const prNumber = commentPayload.issue?.number
    const prAuthor = commentPayload.issue?.user?.login
    const prAuthorId = commentPayload.issue?.user?.id
    const requester = commentPayload.comment?.user?.login
    const installationId = commentPayload.installation?.id

    if (!orgSlug || !repoName || !prNumber || !prAuthor || !requester) {
      return NextResponse.json(
        { error: "Missing required issue_comment payload fields" },
        { status: 400 }
      )
    }

    const org = await getOrganizationBySlug(orgSlug)
    if (!org) {
      return NextResponse.json({ error: `Organization "${orgSlug}" not found` }, { status: 404 })
    }
    const resolvedInstallationId = installationId ?? org.installationId ?? undefined

    let github: ReturnType<typeof getGitHubClient>
    try {
      github = getGitHubClient(resolvedInstallationId)
    } catch (err) {
      console.error("Failed to initialize GitHub client for /recheck:", err)
      return NextResponse.json({ error: "GitHub client is not configured" }, { status: 500 })
    }

    const requesterIsPrAuthor = requester === prAuthor
    const requesterIsAccountOwner = isPersonalAccountOwner(org, requester)
    let requesterIsOrgMember = false
    let requesterCanMaintain = false
    if (!requesterIsPrAuthor && !requesterIsAccountOwner) {
      try {
        if (org.githubAccountType !== "user") {
          const membership = await github.checkOrgMembership(orgSlug, requester)
          requesterIsOrgMember = membership === "active"
        }
        if (!requesterIsOrgMember) {
          const permission = await github.getRepositoryPermissionLevel(orgSlug, repoName, requester)
          requesterCanMaintain =
            permission === "admin" || permission === "maintain" || permission === "write"
        }
      } catch (err) {
        console.error("Failed to authorize /recheck requester:", sanitizeForLog(err))
        return NextResponse.json(
          { error: "Failed to authorize /recheck requester" },
          { status: 502 }
        )
      }
    }

    if (
      !requesterIsPrAuthor &&
      !requesterIsAccountOwner &&
      !requesterIsOrgMember &&
      !requesterCanMaintain
    ) {
      return NextResponse.json(
        {
          error:
            "Forbidden: /recheck requires account owner access, org membership, PR author access, or maintainer permissions",
        },
        { status: 403 }
      )
    }

    let headSha: string
    try {
      headSha = await github.getPullRequestHeadSha(orgSlug, repoName, prNumber)
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        console.error("Failed to resolve PR head SHA for /recheck:", sanitizeForLog(err))
        return NextResponse.json({ error: "Failed to resolve PR head SHA" }, { status: 502 })
      }
      headSha = `recheck-${Date.now()}`
    }

    return handlePrCheck({
      orgSlug,
      repoName,
      prNumber,
      prAuthor,
      prAuthorId,
      headSha,
      baseUrl,
      installationId,
    })
  }

  return NextResponse.json({ message: `Ignored event: ${event}` })
}

type CheckOutput = { title: string; summary: string }

/**
 * Raised inside the PR-check decision logic when the request cannot be
 * evaluated (unknown org, missing installation, ...). The outer handler turns
 * it into a completed *failed* check run plus a JSON error, so the contributor
 * sees why instead of a check that never appears.
 */
class PrCheckAbort extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly output: CheckOutput
  ) {
    super(message)
    this.name = "PrCheckAbort"
  }
}

type CheckRunFinalizer = {
  finalize(conclusion: CheckRunConclusion, output: CheckOutput): Promise<CheckRun>
  readonly finalized: boolean
}

/**
 * Post an `in_progress` check run immediately and return a finalizer that turns
 * it into a completed one. Time-to-visible for the contributor becomes one
 * GitHub round trip instead of "after every DB and API call has finished".
 *
 * If the initial create fails (GitHub hiccup), `finalize` falls back to creating
 * a completed check run directly, so the outcome is still visible.
 */
function startCheckRun(
  github: GitHubClient,
  target: { owner: string; repo: string; headSha: string; prAuthor: string }
): CheckRunFinalizer {
  const pending = github.createCheckRun({
    owner: target.owner,
    repo: target.repo,
    name: CHECK_NAME,
    head_sha: target.headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
    output: {
      title: "CLA: Checking",
      summary: `Verifying whether @${target.prAuthor} needs to sign the CLA.`,
    },
  })
  // Observed later in finalize(); avoid an unhandled-rejection warning in between.
  pending.catch(() => undefined)

  let finalized = false
  return {
    get finalized() {
      return finalized
    },
    async finalize(conclusion, output) {
      const completedAt = new Date().toISOString()
      const completedFields = {
        owner: target.owner,
        repo: target.repo,
        status: "completed" as const,
        conclusion,
        completed_at: completedAt,
        output,
      }

      // Distinguish "the in-progress run was never created" from "it exists but
      // the update failed". Only the former should fall straight through to a
      // fresh completed run.
      let created: CheckRun | null = null
      try {
        created = await pending
      } catch (error) {
        console.error(
          "[webhook] in-progress check run was not created; posting a completed one instead:",
          error instanceof Error ? error.message : error
        )
      }

      if (created) {
        // Retry the update once before giving up on the existing run.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const updated = await github.updateCheckRun({
              ...completedFields,
              check_run_id: created.id,
            })
            finalized = true
            return updated
          } catch (error) {
            console.error(
              `[webhook] updateCheckRun attempt ${attempt} failed for check run ${created.id}:`,
              error instanceof Error ? error.message : error
            )
          }
        }
        // Both updates failed. Post a new completed run with the same name and
        // head SHA: GitHub treats the newest run per name as authoritative for
        // the check suite, so this supersedes the stuck in-progress run.
        console.error(
          `[webhook] superseding in-progress check run ${created.id} with a new completed run`
        )
      }

      const replacement = await github.createCheckRun({
        ...completedFields,
        name: CHECK_NAME,
        head_sha: target.headSha,
      })
      finalized = true
      return replacement
    },
  }
}

async function handlePrCheck(params: {
  orgSlug: string
  repoName: string
  prNumber: number
  prAuthor: string
  prAuthorId?: number
  headSha: string
  baseUrl: string
  installationId?: number
}) {
  const { orgSlug, repoName, prAuthor, headSha, installationId } = params
  const target = { owner: orgSlug, repo: repoName, headSha, prAuthor }

  // Fast path: the webhook payload carries the installation id, so the GitHub
  // client (and the in-progress check) need nothing from the database.
  let github: GitHubClient | null = null
  let checkRun: CheckRunFinalizer | null = null
  if (installationId) {
    try {
      github = getGitHubClient(installationId)
    } catch (err) {
      console.error("Failed to initialize GitHub client:", err)
      return NextResponse.json({ error: "GitHub client is not configured" }, { status: 500 })
    }
    checkRun = startCheckRun(github, target)
  }

  try {
    return await runPrCheck(params, {
      github,
      checkRun,
      ensureClient: (resolvedInstallationId) => {
        if (github && checkRun) return { github, checkRun }
        github = getGitHubClient(resolvedInstallationId)
        checkRun = startCheckRun(github, target)
        return { github, checkRun }
      },
    })
  } catch (error) {
    const abort = error instanceof PrCheckAbort ? error : null
    if (!abort) {
      console.error("[webhook] PR check failed:", error)
    }

    // Whatever happened, never leave an in-progress check behind.
    if (checkRun && !checkRun.finalized) {
      try {
        await checkRun.finalize(
          "failure",
          abort?.output ?? {
            title: "CLA: Check could not complete",
            summary:
              "CLA Bot hit an unexpected error while checking this pull request. Push a new commit or comment `/recheck` to try again.",
          }
        )
      } catch (finalizeError) {
        console.error("[webhook] Failed to finalize check run after error:", finalizeError)
      }
    }

    if (abort) {
      return NextResponse.json({ error: abort.message }, { status: abort.status })
    }
    return NextResponse.json(
      { error: "CLA check failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

async function runPrCheck(
  params: {
    orgSlug: string
    repoName: string
    prNumber: number
    prAuthor: string
    prAuthorId?: number
    headSha: string
    baseUrl: string
    installationId?: number
  },
  clients: {
    github: GitHubClient | null
    checkRun: CheckRunFinalizer | null
    ensureClient: (installationId?: number) => { github: GitHubClient; checkRun: CheckRunFinalizer }
  }
) {
  const { orgSlug, repoName, prNumber, prAuthor, prAuthorId, baseUrl, installationId } = params

  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    throw new PrCheckAbort(404, `Organization "${orgSlug}" not found`, {
      title: "CLA: Organization not registered",
      summary: `@${orgSlug} is not registered with CLA Bot. An admin must install the app for this account.`,
    })
  }

  const resolvedInstallationId = installationId ?? org.installationId ?? undefined
  if (installationId && org.installationId !== installationId) {
    await updateOrganizationInstallationId(orgSlug, installationId)
  }

  if (!resolvedInstallationId && process.env.NODE_ENV === "production") {
    throw new PrCheckAbort(424, `Missing installation ID for organization "${orgSlug}"`, {
      title: "CLA: Installation missing",
      summary: `CLA Bot has no GitHub App installation on record for @${orgSlug}. Reinstall the app to restore checks.`,
    })
  }

  let github: GitHubClient
  let checkRun: CheckRunFinalizer
  try {
    ;({ github, checkRun } = clients.ensureClient(resolvedInstallationId))
  } catch (err) {
    console.error("Failed to initialize GitHub client:", err)
    throw new PrCheckAbort(500, "GitHub client is not configured", {
      title: "CLA: Bot misconfigured",
      summary:
        "CLA Bot could not authenticate with GitHub. The operator needs to check the App credentials.",
    })
  }

  if (!org.isActive) {
    const check = await checkRun.finalize("success", {
      title: "CLA: Bot deactivated",
      summary: `CLA enforcement is currently deactivated for @${orgSlug}. This pull request is not blocked by CLA requirements.`,
    })

    const existingComment = await github.findBotComment(orgSlug, repoName, prNumber)
    let deletedCommentId: number | null = null
    if (existingComment && isRemovableClaPromptComment(existingComment.body)) {
      await github.deleteComment({
        owner: orgSlug,
        repo: repoName,
        comment_id: existingComment.id,
      })
      deletedCommentId = existingComment.id
    }

    await createAuditEvent({
      eventType: "webhook.pr_check",
      orgId: org.id,
      actorGithubId: prAuthorId ? String(prAuthorId) : null,
      actorGithubUsername: prAuthor,
      payload: {
        owner: orgSlug,
        repo: repoName,
        prNumber,
        decision: "inactive",
        checkConclusion: check.conclusion,
        deletedCommentId,
      },
    })

    return NextResponse.json({
      message: `CLA bot is deactivated for ${orgSlug}. Check set to success and CLA prompts removed.`,
      skipped: true,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      comment: null,
      orgMember: false,
      accountOwner: false,
      signed: true,
      needsResign: false,
      inactive: true,
    })
  }

  const bypassAccount = await isBypassAccountForOrg({
    orgId: org.id,
    githubUserId: prAuthorId,
    githubUsername: prAuthor,
  })
  if (bypassAccount) {
    const bypassSummary =
      bypassAccount.bypassKind === "app_bot"
        ? `@${prAuthor} matched app/bot bypass @${bypassAccount.githubUsername} for @${orgSlug}.`
        : `@${prAuthor} is on the CLA bypass list for @${orgSlug}.`
    const check = await checkRun.finalize("success", {
      title: "CLA: Bypassed",
      summary: bypassSummary,
    })

    const existingComment = await github.findBotComment(orgSlug, repoName, prNumber)
    let deletedCommentId: number | null = null
    if (existingComment && isRemovableClaPromptComment(existingComment.body)) {
      await github.deleteComment({
        owner: orgSlug,
        repo: repoName,
        comment_id: existingComment.id,
      })
      deletedCommentId = existingComment.id
    }

    await createAuditEvent({
      eventType: "webhook.pr_check",
      orgId: org.id,
      actorGithubId: prAuthorId ? String(prAuthorId) : null,
      actorGithubUsername: prAuthor,
      payload: {
        owner: orgSlug,
        repo: repoName,
        prNumber,
        decision: "bypass_list",
        checkConclusion: check.conclusion,
        bypassKind: bypassAccount.bypassKind,
        bypassActorSlug: bypassAccount.actorSlug,
        bypassGithubUserId: bypassAccount.githubUserId,
        bypassGithubUsername: bypassAccount.githubUsername,
        deletedCommentId,
      },
    })

    return NextResponse.json({
      message:
        bypassAccount.bypassKind === "app_bot"
          ? `@${prAuthor} matched the app/bot bypass list. Check passed.`
          : `@${prAuthor} is on the bypass list. Check passed.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      comment: null,
      orgMember: false,
      accountOwner: false,
      signed: true,
      needsResign: false,
      bypassed: true,
    })
  }

  const accountOwner = isPersonalAccountOwner(org, prAuthor, prAuthorId)
  const membership =
    org.githubAccountType === "user" || accountOwner
      ? "not_member"
      : await github.checkOrgMembership(orgSlug, prAuthor)
  if (accountOwner || membership === "active") {
    const bypassSummary = accountOwner
      ? `@${prAuthor} is the owner of @${orgSlug}. No CLA signature required.`
      : `@${prAuthor} is a member of @${orgSlug}. No CLA signature required.`
    const check = await checkRun.finalize("success", {
      title: accountOwner ? "CLA: Repository owner" : "CLA: Org member",
      summary: bypassSummary,
    })
    await createAuditEvent({
      eventType: "webhook.pr_check",
      orgId: org.id,
      actorGithubId: prAuthorId ? String(prAuthorId) : null,
      actorGithubUsername: prAuthor,
      payload: {
        owner: orgSlug,
        repo: repoName,
        prNumber,
        decision: accountOwner ? "repo_owner" : "org_member",
        checkConclusion: check.conclusion,
      },
    })
    return NextResponse.json({
      message: accountOwner
        ? `@${prAuthor} is the repository owner for ${orgSlug}. Check passed.`
        : `@${prAuthor} is an org member of ${orgSlug}. Check passed.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      comment: null,
      orgMember: membership === "active",
      accountOwner,
      signed: true,
    })
  }

  if (!org.claTextSha256 || org.claText.trim().length === 0) {
    const check = await checkRun.finalize("failure", {
      title: "CLA: Configuration required",
      summary: `@${orgSlug} has not published a CLA yet. A maintainer must configure one before contributors can sign.`,
    })

    const commentBody = generateUnconfiguredClaComment({
      prAuthor,
      orgName: org.name,
      orgSlug: org.githubOrgSlug,
      appBaseUrl: baseUrl,
    })
    const existingComment = await github.findBotComment(orgSlug, repoName, prNumber)
    const comment = existingComment
      ? await github.updateComment({
          owner: orgSlug,
          repo: repoName,
          comment_id: existingComment.id,
          body: commentBody,
        })
      : await github.createComment({
          owner: orgSlug,
          repo: repoName,
          issue_number: prNumber,
          body: commentBody,
        })

    await createAuditEvent({
      eventType: "webhook.pr_check",
      orgId: org.id,
      actorGithubId: prAuthorId ? String(prAuthorId) : null,
      actorGithubUsername: prAuthor,
      payload: {
        owner: orgSlug,
        repo: repoName,
        prNumber,
        decision: "cla_unconfigured",
        checkConclusion: check.conclusion,
        commentId: comment.id,
      },
    })

    return NextResponse.json({
      message: `CLA is not configured for ${orgSlug}. Check failed until maintainers publish one.`,
      check: { id: check.id, status: "failure", conclusion: check.conclusion },
      comment: { id: comment.id, commentMarkdown: comment.body },
      orgMember: false,
      accountOwner: false,
      signed: false,
      needsResign: false,
      configRequired: true,
    })
  }

  const sigStatus =
    typeof prAuthorId === "number"
      ? await getSignatureStatusByGithubId(orgSlug, String(prAuthorId))
      : await getSignatureStatusByUsername(orgSlug, prAuthor)
  const isSigned = sigStatus.signed && sigStatus.currentVersion
  const needsResign = sigStatus.signed && !sigStatus.currentVersion
  const versionLabel = org.claTextSha256 ? org.claTextSha256.slice(0, 7) : "unknown"

  if (isSigned) {
    const check = await checkRun.finalize("success", {
      title: "CLA: Signed",
      summary: `@${prAuthor} has signed the current CLA (version \`${versionLabel}\`).`,
    })
    await createAuditEvent({
      eventType: "webhook.pr_check",
      orgId: org.id,
      actorGithubId: prAuthorId ? String(prAuthorId) : null,
      actorGithubUsername: prAuthor,
      payload: {
        owner: orgSlug,
        repo: repoName,
        prNumber,
        decision: "signed",
        checkConclusion: check.conclusion,
        needsResign,
      },
    })

    return NextResponse.json({
      message: `@${prAuthor} has signed the current CLA. Check passed.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      comment: null,
      orgMember: false,
      accountOwner: false,
      signed: true,
      needsResign: false,
    })
  }

  const check = await checkRun.finalize("failure", {
    title: needsResign ? "CLA: Re-signing required" : "CLA: Signature required",
    summary: needsResign
      ? `@${prAuthor} signed an older CLA. Please re-sign (version \`${versionLabel}\`).`
      : `@${prAuthor} has not signed the CLA for ${orgSlug}. Please sign to continue.`,
  })

  const commentBody = generateUnsignedComment({
    prAuthor,
    orgName: org.name,
    orgSlug: org.githubOrgSlug,
    repoName,
    prNumber,
    claVersionLabel: versionLabel,
    appBaseUrl: baseUrl,
    isResign: needsResign,
  })

  const existingComment = await github.findBotComment(orgSlug, repoName, prNumber)
  let comment: { id: number; commentMarkdown: string }

  if (existingComment) {
    const updated = await github.updateComment({
      owner: orgSlug,
      repo: repoName,
      comment_id: existingComment.id,
      body: commentBody,
    })
    comment = { id: updated.id, commentMarkdown: updated.body }
  } else {
    const created = await github.createComment({
      owner: orgSlug,
      repo: repoName,
      issue_number: prNumber,
      body: commentBody,
    })
    comment = { id: created.id, commentMarkdown: created.body }
  }

  await createAuditEvent({
    eventType: "webhook.pr_check",
    orgId: org.id,
    actorGithubId: prAuthorId ? String(prAuthorId) : null,
    actorGithubUsername: prAuthor,
    payload: {
      owner: orgSlug,
      repo: repoName,
      prNumber,
      decision: needsResign ? "resign_required" : "signature_required",
      checkConclusion: check.conclusion,
      commentId: comment.id,
    },
  })

  return NextResponse.json({
    message: needsResign
      ? `@${prAuthor} needs to re-sign the CLA (version ${versionLabel}). Check failed, comment posted.`
      : `@${prAuthor} has not signed the CLA. Check failed, comment posted.`,
    check: { id: check.id, status: "failure", conclusion: check.conclusion },
    comment,
    orgMember: false,
    accountOwner: false,
    signed: false,
    needsResign,
  })
}

async function handleInstallation(payload: InstallationPayload) {
  const orgSlug = payload.installation?.account?.login
  const accountType = normalizeGitHubAccountType(payload.installation?.account?.type)
  const accountId = payload.installation?.account?.id
  const installationId = payload.installation?.id
  if (!orgSlug) {
    return NextResponse.json({ error: "Missing installation account login" }, { status: 400 })
  }

  const existing = await resolveOrganizationForReconciliation({
    accountId,
    installationId,
    currentSlug: orgSlug,
  })
  if (existing && existing.githubOrgSlug !== orgSlug) {
    await updateOrganizationSlug(existing.id, orgSlug, {
      githubAccountId: accountId ?? existing.githubAccountId,
    })
  }

  if (payload.action === "created" || payload.action === "unsuspend") {
    let adminUserId = "user_1"
    if (payload.sender?.login && payload.sender?.id) {
      const senderUser = await upsertUser({
        githubId: String(payload.sender.id),
        githubUsername: payload.sender.login,
        avatarUrl: payload.sender.avatar_url || "https://avatars.githubusercontent.com/u/1",
        name: payload.sender.login,
        role: "admin",
      })
      adminUserId = senderUser.id
    } else if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Missing installation sender info" }, { status: 400 })
    }

    if (existing) {
      await setOrganizationActive(orgSlug, true)
      const updated = await updateOrganizationInstallationId(orgSlug, installationId ?? null, {
        githubAccountType: accountType,
        githubAccountId: accountId,
      })
      return NextResponse.json({
        message: `App active on account: ${orgSlug}`,
        org: updated ?? { ...existing, installationId: installationId ?? existing.installationId },
      })
    }

    const org = await createOrganization({
      githubOrgSlug: orgSlug,
      githubAccountType: accountType,
      githubAccountId: accountId,
      name: orgSlug,
      avatarUrl:
        payload.installation?.account?.avatar_url ??
        `https://api.dicebear.com/7.x/initials/svg?seed=${orgSlug}&backgroundColor=059669`,
      adminUserId,
      installationId,
    })

    return NextResponse.json({
      message: `App installed on account: ${orgSlug}`,
      org,
    })
  }

  if (payload.action === "deleted" || payload.action === "suspend") {
    await setOrganizationActive(orgSlug, false)
    await updateOrganizationInstallationId(orgSlug, null, {
      githubAccountType: accountType,
      githubAccountId: accountId,
    })
    return NextResponse.json({
      message:
        payload.action === "deleted"
          ? `App uninstalled from account: ${orgSlug}`
          : `App suspended on account: ${orgSlug}`,
    })
  }

  return NextResponse.json({ message: `Ignored installation action: ${payload.action}` })
}

async function handleInstallationRepositories(payload: InstallationPayload) {
  const orgSlug = payload.installation?.account?.login
  const accountType = normalizeGitHubAccountType(payload.installation?.account?.type)
  const accountId = payload.installation?.account?.id
  const installationId = payload.installation?.id
  if (!orgSlug) {
    return NextResponse.json({ error: "Missing installation account login" }, { status: 400 })
  }

  const existing = await resolveOrganizationForReconciliation({
    accountId,
    installationId,
    currentSlug: orgSlug,
  })
  if (existing && existing.githubOrgSlug !== orgSlug) {
    await updateOrganizationSlug(existing.id, orgSlug, {
      githubAccountId: accountId ?? existing.githubAccountId,
    })
  }

  await updateOrganizationInstallationId(orgSlug, installationId ?? null, {
    githubAccountType: accountType,
    githubAccountId: accountId,
  })

  return NextResponse.json({
    message: `installation_repositories processed for account: ${orgSlug}`,
    action: payload.action,
  })
}

async function handleOrganization(payload: OrganizationPayload) {
  if (payload.action !== "renamed") {
    return NextResponse.json({ message: `Ignored organization action: ${payload.action}` })
  }

  const accountId = payload.organization?.id
  const newSlug = payload.organization?.login
  const previousSlug = payload.changes?.login?.from
  if (!accountId || !newSlug) {
    return NextResponse.json({ error: "Missing organization id/login" }, { status: 400 })
  }

  const existing = await resolveOrganizationForReconciliation({
    accountId,
    previousSlug,
  })
  if (!existing) {
    return NextResponse.json({
      message: `No org record for account id ${accountId}, ignoring rename`,
    })
  }

  if (existing.githubOrgSlug === newSlug) {
    if (!existing.githubAccountId) {
      await updateOrganizationSlug(existing.id, newSlug, { githubAccountId: accountId })
    }
    return NextResponse.json({ message: "Org slug already up to date" })
  }

  const updated = await updateOrganizationSlug(existing.id, newSlug, {
    githubAccountId: accountId,
  })
  return NextResponse.json({
    message: `Renamed org slug ${existing.githubOrgSlug} -> ${newSlug}`,
    org: updated,
  })
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const orgSlug = searchParams.get("orgSlug")
  const repoName = searchParams.get("repoName")
  const prNumber = searchParams.get("prNumber")

  if (!orgSlug || !repoName || !prNumber) {
    return NextResponse.json({ error: "Missing orgSlug, repoName, or prNumber" }, { status: 400 })
  }

  const org = await getOrganizationBySlug(orgSlug)
  const github = getGitHubClient(org?.installationId ?? undefined)

  const botComment = await github.findBotComment(orgSlug, repoName, Number(prNumber))

  return NextResponse.json({
    comment: botComment ? { id: botComment.id, commentMarkdown: botComment.body } : null,
  })
}

function normalizeGitHubAccountType(type?: "Organization" | "User"): GitHubAccountType {
  return type === "User" ? "user" : "organization"
}

async function resolveOrganizationForReconciliation(params: {
  accountId?: number | null
  installationId?: number | null
  previousSlug?: string | null
  currentSlug?: string | null
}) {
  if (params.accountId) {
    const byAccountId = await getOrganizationByGithubAccountId(String(params.accountId))
    if (byAccountId) return byAccountId
  }

  if (params.installationId) {
    const byInstallationId = await getOrganizationByInstallationId(params.installationId)
    if (byInstallationId) return byInstallationId
  }

  if (params.previousSlug) {
    const byPreviousSlug = await getOrganizationBySlug(params.previousSlug)
    if (byPreviousSlug) return byPreviousSlug
  }

  if (params.currentSlug) {
    const byCurrentSlug = await getOrganizationBySlug(params.currentSlug)
    if (byCurrentSlug) return byCurrentSlug
  }

  return undefined
}

function isPersonalAccountOwner(
  org: {
    githubOrgSlug: string
    githubAccountType?: string | null
    githubAccountId?: string | null
  },
  username: string,
  githubUserId?: number
) {
  if (org.githubAccountType !== "user") return false

  const normalizedUsername = username.trim().toLowerCase()
  if (normalizedUsername === org.githubOrgSlug.toLowerCase()) return true
  if (typeof githubUserId !== "number") return false
  if (!org.githubAccountId) return false
  return String(githubUserId) === String(org.githubAccountId)
}

function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

function isDependabotLikePullRequest(payload: PullRequestPayload) {
  const authorLogin = payload.pull_request?.user?.login?.toLowerCase() ?? ""
  const senderLogin = payload.sender?.login?.toLowerCase() ?? ""
  const headRef = payload.pull_request?.head?.ref?.toLowerCase() ?? ""
  const authorType = payload.pull_request?.user?.type ?? ""
  const senderType = payload.sender?.type ?? ""

  return (
    authorLogin.includes("dependabot") ||
    senderLogin.includes("dependabot") ||
    headRef.startsWith("dependabot/") ||
    authorType === "Bot" ||
    senderType === "Bot" ||
    authorLogin.endsWith("[bot]") ||
    senderLogin.endsWith("[bot]")
  )
}

function generateUnconfiguredClaComment(params: {
  prAuthor: string
  orgName: string
  orgSlug: string
  appBaseUrl: string
}) {
  const { prAuthor, orgName, orgSlug, appBaseUrl } = params
  const adminUrl = `${appBaseUrl}/admin/${encodeURIComponent(orgSlug)}`

  return `${CLA_BOT_COMMENT_SIGNATURE}

### CLA setup in progress

Hey @${prAuthor}, thanks for contributing to **${orgName}**.

This repository has not published a Contributor License Agreement yet, so we cannot validate signatures for external contributors at this time.

A maintainer must publish the CLA first: ${adminUrl}

<sub>Once the CLA is configured, this check will enforce contributor signing automatically.</sub>`
}

function isRemovableClaPromptComment(commentBody: string) {
  if (!isClaBotManagedComment(commentBody)) return false
  return (
    commentBody.includes("Contributor License Agreement Required") ||
    commentBody.includes("Re-signing Required") ||
    commentBody.includes("CLA Bot is not configured for this repository")
  )
}
