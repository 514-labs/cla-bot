import { type NextRequest, NextResponse } from "next/server"
import {
  getSessionUser,
  getOrganizationBySlug,
  getSignatureStatus,
  createSignature,
} from "@/lib/db/queries"
import { getGitHubClient, getAllCheckRuns, getAllComments, type CheckRun } from "@/lib/github"
import { generateSignedComment } from "@/lib/pr-comment-template"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { orgSlug } = body

  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 })
  }

  const user = getSessionUser()
  const org = await getOrganizationBySlug(orgSlug)

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  if (!org.isActive) {
    return NextResponse.json({ error: "CLA bot is not active for this organization" }, { status: 403 })
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

  // Auto-update failing check runs for this user via GitHub API
  const github = getGitHubClient()
  const allChecks = getAllCheckRuns()
  const updatedChecks: CheckRun[] = []

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

  // Also update bot comments on PRs where the check was failing
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cla.fiveonefour.com"
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
          appBaseUrl: baseUrl,
        }),
      })
    }
  }

  return NextResponse.json({ signature, updatedChecks })
}
