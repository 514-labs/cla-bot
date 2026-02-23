import { type NextRequest, NextResponse } from "next/server"
import { createHmac } from "node:crypto"
import {
  getOrganizationBySlug,
  getSignatureStatus,
  createSignature,
  createAuditEvent,
} from "@/lib/db/queries"
import { getGitHubClient, type CheckRun } from "@/lib/github"
import { generateSignedComment } from "@/lib/pr-comment-template"
import { getSessionUser } from "@/lib/auth"

const CHECK_NAME = "CLA Bot / Contributor License Agreement"
const DEFAULT_CONSENT_TEXT_VERSION = "v1"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { orgSlug, repoName, prNumber, acceptedSha256, assented, consentTextVersion } = body as {
    orgSlug?: string
    repoName?: string
    prNumber?: number | string
    acceptedSha256?: string
    assented?: boolean
    consentTextVersion?: string
  }

  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 })
  }
  const normalizedAssented = assented ?? true
  if (normalizedAssented !== true) {
    return NextResponse.json(
      { error: "Explicit assent is required before signing" },
      { status: 400 }
    )
  }
  const normalizedConsentTextVersion =
    typeof consentTextVersion === "string" && consentTextVersion.trim()
      ? consentTextVersion.trim()
      : DEFAULT_CONSENT_TEXT_VERSION

  const parsedPrNumber = normalizePrNumber(prNumber)
  if ((repoName && !parsedPrNumber) || (!repoName && parsedPrNumber)) {
    return NextResponse.json(
      { error: "repoName and prNumber must be provided together" },
      { status: 400 }
    )
  }

  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const org = await getOrganizationBySlug(orgSlug)

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  if (!org.isActive) {
    return NextResponse.json(
      { error: "CLA bot is not active for this organization" },
      { status: 403 }
    )
  }

  if (!org.claTextSha256) {
    return NextResponse.json({ error: "No CLA configured for this organization" }, { status: 400 })
  }
  const normalizedAcceptedSha256 =
    typeof acceptedSha256 === "string" && acceptedSha256.trim().length > 0
      ? acceptedSha256
      : org.claTextSha256
  if (normalizedAcceptedSha256 !== org.claTextSha256) {
    return NextResponse.json(
      {
        error:
          "CLA version mismatch. Reload the page and review the latest agreement before signing.",
        currentSha256: org.claTextSha256,
      },
      { status: 409 }
    )
  }

  // Check if already signed the current sha256
  const status = await getSignatureStatus(orgSlug, user.id)
  if (status.signed && status.currentVersion) {
    return NextResponse.json(
      { error: "Already signed current version", signature: status.signature },
      { status: 409 }
    )
  }

  const emailEvidence = resolveEmailEvidence(user)

  // Create new signature -- also lazily creates archive if needed
  const signature = await createSignature({
    orgId: org.id,
    userId: user.id,
    claSha256: org.claTextSha256,
    acceptedSha256: normalizedAcceptedSha256,
    consentTextVersion: normalizedConsentTextVersion,
    assented: normalizedAssented,
    claText: org.claText,
    githubUserIdAtSignature: user.githubId,
    githubUsername: user.githubUsername,
    emailAtSignature: emailEvidence.email,
    emailVerifiedAtSignature: emailEvidence.verified,
    emailSource: emailEvidence.source,
    sessionJti: user.sessionJti,
    ipHash: hashRequestIp(request),
    userAgent: request.headers.get("user-agent"),
    name: user.name,
    avatarUrl: user.avatarUrl,
  })

  await createAuditEvent({
    eventType: "signature.created",
    orgId: org.id,
    userId: user.id,
    actorGithubId: user.githubId,
    actorGithubUsername: user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      acceptedSha256: normalizedAcceptedSha256,
      consentTextVersion: normalizedConsentTextVersion,
      repoName: repoName ?? null,
      prNumber: parsedPrNumber ?? null,
    },
  })

  const versionLabel = org.claTextSha256.slice(0, 7)

  const updatedChecks: CheckRun[] = []
  let updatedCommentId: number | null = null
  let autoUpdateSkippedReason: string | null = null

  // Preferred path: update the check/comment for the specific PR context
  // that sent the contributor to the signing page.
  if (repoName && parsedPrNumber && org.installationId) {
    try {
      const github = getGitHubClient(org.installationId)
      const pullRequest = await github.getPullRequest(orgSlug, repoName, parsedPrNumber)
      if (!pullRequest) {
        autoUpdateSkippedReason = "pull_request_not_found"
      } else if (
        (typeof pullRequest.authorId === "number" &&
          String(pullRequest.authorId) !== user.githubId) ||
        (typeof pullRequest.authorId !== "number" &&
          pullRequest.authorLogin !== user.githubUsername)
      ) {
        autoUpdateSkippedReason = "signer_not_pr_author"
      } else {
        const existingCheck = await github.getCheckRunForPr(
          orgSlug,
          repoName,
          pullRequest.headSha,
          CHECK_NAME
        )

        if (existingCheck && existingCheck.conclusion === "failure") {
          const updated = await github.updateCheckRun({
            owner: orgSlug,
            repo: repoName,
            check_run_id: existingCheck.id,
            status: "completed",
            conclusion: "success",
            output: {
              title: "CLA: Signed",
              summary: `@${user.githubUsername} has signed the CLA. Check updated automatically.`,
            },
          })
          updatedChecks.push(updated)
        }

        const existingComment = await github.findBotComment(orgSlug, repoName, parsedPrNumber)
        if (
          existingComment &&
          (existingComment.body.includes("Contributor License Agreement Required") ||
            existingComment.body.includes("Re-signing Required"))
        ) {
          await github.updateComment({
            owner: orgSlug,
            repo: repoName,
            comment_id: existingComment.id,
            body: generateSignedComment({
              prAuthor: user.githubUsername,
              orgName: org.name,
              claVersionLabel: versionLabel,
              appBaseUrl: getAppBaseUrl(),
            }),
          })
          updatedCommentId = existingComment.id
        }
      }
    } catch (err) {
      console.error("Failed to auto-update GitHub PR status after signing:", err)
    }
  }

  return NextResponse.json({ signature, updatedChecks, updatedCommentId, autoUpdateSkippedReason })
}

function normalizePrNumber(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://cla.fiveonefour.com"
}

function resolveEmailEvidence(user: {
  email?: string
  emailVerified?: boolean
  emailSource?: string
  githubUsername: string
}) {
  const normalizedEmail = typeof user.email === "string" ? user.email.trim() : ""
  if (normalizedEmail.length > 0) {
    return {
      email: normalizedEmail,
      verified: Boolean(user.emailVerified),
      source: user.emailSource ?? "any",
    }
  }

  return {
    email: `${user.githubUsername}@users.noreply.github.com`,
    verified: false,
    source: "none",
  }
}

function hashRequestIp(request: NextRequest) {
  const secret = process.env.SESSION_SECRET
  if (!secret) return null

  const forwardedFor = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  const source = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || ""
  if (!source) return null

  return createHmac("sha256", secret).update(source).digest("hex")
}
