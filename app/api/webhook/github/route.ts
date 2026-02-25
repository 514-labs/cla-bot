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
import {
  getOrganizationBySlug,
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
import { generateUnsignedComment } from "@/lib/pr-comment-template"
import { verifyGitHubWebhookSignature } from "@/lib/github/webhook-signature"

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
  pull_request?: {
    user?: { login?: string; id?: number }
    head?: { sha?: string }
  }
  repository?: {
    name?: string
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
  const verificationError = verifyWebhookRequest(
    rawBody,
    request.headers.get("x-hub-signature-256")
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
        console.error("Failed to authorize /recheck requester:", err)
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
        console.error("Failed to resolve PR head SHA for /recheck:", err)
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
  const { orgSlug, repoName, prNumber, prAuthor, prAuthorId, headSha, baseUrl, installationId } =
    params

  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return NextResponse.json({ error: `Organization "${orgSlug}" not found` }, { status: 404 })
  }

  if (!org.isActive) {
    return NextResponse.json({
      message: `CLA bot is deactivated for ${orgSlug}. No check or comment.`,
      skipped: true,
    })
  }

  const resolvedInstallationId = installationId ?? org.installationId ?? undefined
  if (installationId && org.installationId !== installationId) {
    await updateOrganizationInstallationId(orgSlug, installationId)
  }

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
    console.error("Failed to initialize GitHub client:", err)
    return NextResponse.json({ error: "GitHub client is not configured" }, { status: 500 })
  }

  const bypassAccount = await isBypassAccountForOrg({
    orgId: org.id,
    githubUserId: prAuthorId,
    githubUsername: prAuthor,
  })
  if (bypassAccount) {
    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "CLA: Bypassed",
        summary: `@${prAuthor} is on the CLA bypass list for @${orgSlug}.`,
      },
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
        bypassGithubUserId: bypassAccount.githubUserId,
        bypassGithubUsername: bypassAccount.githubUsername,
        deletedCommentId,
      },
    })

    return NextResponse.json({
      message: `@${prAuthor} is on the bypass list. Check passed.`,
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
    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
      output: {
        title: accountOwner ? "CLA: Repository owner" : "CLA: Org member",
        summary: bypassSummary,
      },
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
    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "failure",
      output: {
        title: "CLA: Configuration required",
        summary: `@${orgSlug} has not published a CLA yet. A maintainer must configure one before contributors can sign.`,
      },
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
    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "CLA: Signed",
        summary: `@${prAuthor} has signed the current CLA (version \`${versionLabel}\`).`,
      },
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

  const check = await github.createCheckRun({
    owner: orgSlug,
    repo: repoName,
    name: CHECK_NAME,
    head_sha: headSha,
    status: "completed",
    conclusion: "failure",
    output: {
      title: needsResign ? "CLA: Re-signing required" : "CLA: Signature required",
      summary: needsResign
        ? `@${prAuthor} signed an older CLA. Please re-sign (version \`${versionLabel}\`).`
        : `@${prAuthor} has not signed the CLA for ${orgSlug}. Please sign to continue.`,
    },
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

    const existing = await getOrganizationBySlug(orgSlug)
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

  await updateOrganizationInstallationId(orgSlug, installationId ?? null, {
    githubAccountType: accountType,
    githubAccountId: accountId,
  })

  return NextResponse.json({
    message: `installation_repositories processed for account: ${orgSlug}`,
    action: payload.action,
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

function verifyWebhookRequest(rawPayload: string, signatureHeader: string | null) {
  const configuredSecret = process.env.GITHUB_WEBHOOK_SECRET
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "GITHUB_WEBHOOK_SECRET is not configured" },
        { status: 500 }
      )
    }
    return null
  }

  const secret = normalizeWebhookSecret(configuredSecret)
  if (!signatureHeader) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Missing x-hub-signature-256 header" }, { status: 401 })
    }
    return null
  }

  const valid = verifyGitHubWebhookSignature({
    secret,
    payload: rawPayload,
    signatureHeader: signatureHeader.trim(),
  })
  if (!valid) {
    return NextResponse.json(
      {
        error:
          "Invalid webhook signature. Ensure GITHUB_WEBHOOK_SECRET exactly matches the GitHub App webhook secret.",
      },
      { status: 401 }
    )
  }

  return null
}

function normalizeWebhookSecret(secret: string): string {
  const trimmed = secret.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

function generateUnconfiguredClaComment(params: {
  prAuthor: string
  orgName: string
  orgSlug: string
  appBaseUrl: string
}) {
  const { prAuthor, orgName, orgSlug, appBaseUrl } = params
  const adminUrl = `${appBaseUrl}/admin/${encodeURIComponent(orgSlug)}`

  return `### CLA setup in progress

Hey @${prAuthor}, thanks for contributing to **${orgName}**.

This repository has not published a Contributor License Agreement yet, so we cannot validate signatures for external contributors at this time.

A maintainer must publish the CLA first: ${adminUrl}

<sub>Once the CLA is configured, this check will enforce contributor signing automatically.</sub>`
}

function isRemovableClaPromptComment(commentBody: string) {
  return (
    commentBody.includes("Contributor License Agreement Required") ||
    commentBody.includes("Re-signing Required") ||
    commentBody.includes("CLA Bot is not configured for this repository")
  )
}
