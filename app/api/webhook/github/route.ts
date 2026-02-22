/**
 * GitHub Webhook handler for CLA Bot.
 *
 * Uses two distinct layers:
 *   - GitHubClient (mock or Octokit) for all GitHub API calls:
 *       check runs, PR comments, org membership, user lookup
 *   - mock-db for app-level data:
 *       CLA versions, signatures, organizations
 *
 * Scenarios:
 *   1. Org member           -> green check, NO comment
 *   2. Non-member, unsigned -> red check, comment with sign CTA
 *   3. Non-member, stale    -> red check, comment with re-sign CTA
 *   4. Non-member, signed   -> green check, NO comment
 *   5. Bot deactivated      -> NO check, NO comment (completely skipped)
 */

import { type NextRequest, NextResponse } from "next/server"
import { getGitHubClient } from "@/lib/github"
import {
  getOrganizationBySlug,
  getSignatureStatusByUsername,
  createOrganization,
  setOrganizationActive,
} from "@/lib/db/queries"
import {
  generateUnsignedComment,
  generateSignedComment,
} from "@/lib/pr-comment-template"

const CHECK_NAME = "CLA Bot / Contributor License Agreement"

// ============================================================
// POST — incoming webhooks from GitHub
// ============================================================

export async function POST(request: NextRequest) {
  const event = request.headers.get("x-github-event")
  const payload = await request.json()
  const baseUrl = getBaseUrl(request)

  if (event === "installation") {
    return await handleInstallation(payload)
  }

  if (event === "pull_request") {
    const action = payload.action
    if (!["opened", "synchronize", "reopened"].includes(action)) {
      return NextResponse.json({ message: "PR action ignored", action })
    }
    return handlePrCheck({
      orgSlug: payload.repository.owner.login,
      repoName: payload.repository.name,
      prNumber: payload.number,
      prAuthor: payload.pull_request.user.login,
      headSha: payload.pull_request.head.sha ?? `sha-${Date.now()}`,
      baseUrl,
    })
  }

  if (event === "issue_comment") {
    if (payload.action !== "created") {
      return NextResponse.json({ message: "Ignored non-created comment" })
    }
    const body: string = payload.comment?.body ?? ""
    if (!body.trim().toLowerCase().startsWith("/recheck")) {
      return NextResponse.json({ message: "Not a /recheck command" })
    }
    return handlePrCheck({
      orgSlug: payload.repository.owner.login,
      repoName: payload.repository.name,
      prNumber: payload.issue.number,
      prAuthor: payload.issue.user.login,
      headSha: `recheck-${Date.now()}`,
      baseUrl,
    })
  }

  return NextResponse.json({ message: `Ignored event: ${event}` })
}

// ============================================================
// Core PR check logic — delegates to GitHubClient + app DB
// ============================================================

async function handlePrCheck(params: {
  orgSlug: string
  repoName: string
  prNumber: number
  prAuthor: string
  headSha: string
  baseUrl: string
}) {
  const { orgSlug, repoName, prNumber, prAuthor, headSha, baseUrl } = params
  const github = getGitHubClient()

  // ── Look up org in app DB ──
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return NextResponse.json(
      { error: `Organization "${orgSlug}" not found` },
      { status: 404 }
    )
  }

  // ── Scenario 5: Bot deactivated -> skip entirely ──
  if (!org.isActive) {
    return NextResponse.json({
      message: `CLA bot is deactivated for ${orgSlug}. No check or comment.`,
      skipped: true,
    })
  }

  // ── Scenario 1: Org member -> green check, no comment ──
  const membership = await github.checkOrgMembership(orgSlug, prAuthor)
  if (membership === "active") {
    const check = await github.createCheckRun({
      owner: orgSlug,
      repo: repoName,
      name: CHECK_NAME,
      head_sha: headSha,
      status: "completed",
      conclusion: "success",
      output: {
        title: "CLA: Org member",
        summary: `@${prAuthor} is a member of @${orgSlug}. No CLA signature required.`,
      },
    })
    return NextResponse.json({
      message: `@${prAuthor} is an org member of ${orgSlug}. Check passed.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      comment: null,
      orgMember: true,
      signed: true,
    })
  }

  // ── Check CLA signature in app DB (by GitHub username) ──
  const sigStatus = await getSignatureStatusByUsername(orgSlug, prAuthor)
  const isSigned = sigStatus.signed && sigStatus.currentVersion
  const needsResign = sigStatus.signed && !sigStatus.currentVersion
  const versionLabel = org.claTextSha256 ? org.claTextSha256.slice(0, 7) : "unknown"

  // ── Scenario 4: Signed current version -> green check, no comment ──
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
    return NextResponse.json({
      message: `@${prAuthor} has signed the current CLA. Check passed.`,
      check: { id: check.id, status: "success", conclusion: check.conclusion },
      comment: null,
      orgMember: false,
      signed: true,
      needsResign: false,
    })
  }

  // ── Scenarios 2 & 3: Not signed / needs re-sign -> red check + comment ──
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

  // Generate comment markdown
  const commentBody = generateUnsignedComment({
    prAuthor,
    orgName: org.name,
    orgSlug: org.githubOrgSlug,
    claVersionLabel: versionLabel,
    appBaseUrl: baseUrl,
    isResign: needsResign,
  })

  // Update existing bot comment or create a new one
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

  return NextResponse.json({
    message: needsResign
      ? `@${prAuthor} needs to re-sign the CLA (version ${versionLabel}). Check failed, comment posted.`
      : `@${prAuthor} has not signed the CLA. Check failed, comment posted.`,
    check: { id: check.id, status: "failure", conclusion: check.conclusion },
    comment,
    orgMember: false,
    signed: false,
    needsResign,
  })
}

// ============================================================
// Installation events
// ============================================================

async function handleInstallation(payload: {
  action: string
  installation: { account: { login: string } }
}) {
  const orgSlug = payload.installation.account.login

  if (payload.action === "created") {
    const existing = await getOrganizationBySlug(orgSlug)
    if (existing) {
      await setOrganizationActive(orgSlug, true)
      return NextResponse.json({
        message: `App re-installed on org: ${orgSlug}`,
        org: existing,
      })
    }
    const org = await createOrganization({
      githubOrgSlug: orgSlug,
      name: orgSlug,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${orgSlug}&backgroundColor=059669`,
      adminUserId: "user_1",
    })
    return NextResponse.json({
      message: `App installed on org: ${orgSlug}`,
      org,
    })
  }

  if (payload.action === "deleted") {
    await setOrganizationActive(orgSlug, false)
    return NextResponse.json({
      message: `App uninstalled from org: ${orgSlug}`,
    })
  }

  return NextResponse.json({ message: `Ignored installation action: ${payload.action}` })
}

// ============================================================
// GET — debug / preview endpoint to inspect PR state
// ============================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const orgSlug = searchParams.get("orgSlug")
  const repoName = searchParams.get("repoName")
  const prNumber = searchParams.get("prNumber")

  if (!orgSlug || !repoName || !prNumber) {
    return NextResponse.json(
      { error: "Missing orgSlug, repoName, or prNumber" },
      { status: 400 }
    )
  }

  const github = getGitHubClient()

  // Get bot comment for this PR
  const botComment = await github.findBotComment(orgSlug, repoName, Number(prNumber))

  return NextResponse.json({
    comment: botComment
      ? { id: botComment.id, commentMarkdown: botComment.body }
      : null,
  })
}

// ============================================================
// Helpers
// ============================================================

function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}
