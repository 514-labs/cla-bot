import { type NextRequest, NextResponse } from "next/server"
import { getOrganizationBySlug, getSignatureStatus, createSignature } from "@/lib/db/queries"
import { getGitHubClient, getAllCheckRuns, getAllComments, type CheckRun } from "@/lib/github"
import { generateSignedComment } from "@/lib/pr-comment-template"
import { getSessionUser } from "@/lib/auth"

const CHECK_NAME = "CLA Bot / Contributor License Agreement"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { orgSlug, repoName, prNumber } = body as {
    orgSlug?: string
    repoName?: string
    prNumber?: number | string
  }

  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 })
  }

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

  // Check if already signed the current sha256
  const status = await getSignatureStatus(orgSlug, user.id)
  if (status.signed && status.currentVersion) {
    return NextResponse.json(
      { error: "Already signed current version", signature: status.signature },
      { status: 409 }
    )
  }

  // Create new signature -- also lazily creates archive if needed
  const signature = await createSignature({
    orgId: org.id,
    userId: user.id,
    claSha256: org.claTextSha256,
    claText: org.claText,
    githubUsername: user.githubUsername,
    name: user.name,
    avatarUrl: user.avatarUrl,
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
      } else if (pullRequest.authorLogin !== user.githubUsername) {
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
  } else if (process.env.NODE_ENV !== "production" && !org.installationId) {
    // Dev/test fallback: keep compatibility with in-memory preview flows.
    const github = getGitHubClient(org.installationId ?? undefined)
    const allChecks = getAllCheckRuns()
    for (const check of allChecks) {
      if (
        check.conclusion === "failure" &&
        check.output.summary.includes(`@${user.githubUsername}`)
      ) {
        const updated = await github.updateCheckRun({
          owner: orgSlug,
          repo: "",
          check_run_id: check.id,
          status: "completed",
          conclusion: "success",
          output: {
            title: "CLA: Signed",
            summary: `@${user.githubUsername} has signed the CLA. Check updated automatically.`,
          },
        })
        updatedChecks.push(updated)
      }
    }

    const allComments = getAllComments()
    for (const comment of allComments) {
      if (
        comment.body.includes(`@${user.githubUsername}`) &&
        (comment.body.includes("Contributor License Agreement Required") ||
          comment.body.includes("Re-signing Required"))
      ) {
        await github.updateComment({
          owner: comment.owner,
          repo: comment.repo,
          comment_id: comment.id,
          body: generateSignedComment({
            prAuthor: user.githubUsername,
            orgName: org.name,
            claVersionLabel: versionLabel,
            appBaseUrl: getAppBaseUrl(),
          }),
        })
      }
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
