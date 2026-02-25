import { createAuditEvent, getOrganizationBySlug } from "@/lib/db/queries"
import { getGitHubClient } from "@/lib/github"

const CHECK_NAME = "CLA Bot / Contributor License Agreement"

type OrganizationRow = Awaited<ReturnType<typeof getOrganizationBySlug>>
type AuditEventInput = Parameters<typeof createAuditEvent>[0]

export type SignerPrSyncWorkflowInput = {
  orgSlug: string
  orgId: string
  signedClaSha256: string
  signer: {
    userId: string
    githubId: string | null
    githubUsername: string
  }
  repoName: string | null
  prNumber: number | null
}

export type SignerPrSyncWorkflowSummary = {
  attemptedOpenPrs: number
  matchedSignerOpenPrs: number
  updatedChecks: number
  deletedComments: number
  skippedAlreadyPassingChecks: number
  skippedMissingCheckRuns: number
  skippedMissingComments: number
  targetedPrStatus: "not_requested" | "matched" | "pull_request_not_found" | "signer_not_pr_author"
  error: string | null
}

export type SignerPrSyncWorkflowResult =
  | {
      status: "completed"
      summary: SignerPrSyncWorkflowSummary
    }
  | {
      status: "superseded" | "org_not_found" | "skipped" | "failed"
      reason?: string
      error?: string
      summary?: SignerPrSyncWorkflowSummary
    }

export async function runSignerPrSyncWorkflow(
  input: SignerPrSyncWorkflowInput
): Promise<SignerPrSyncWorkflowResult> {
  "use workflow"

  const latestOrg = await loadOrganizationForSync(input.orgSlug)
  if (!latestOrg) {
    await recordAuditEvent({
      eventType: "signature.pr_sync_failed",
      orgId: input.orgId,
      userId: input.signer.userId,
      actorGithubId: input.signer.githubId,
      actorGithubUsername: input.signer.githubUsername,
      payload: {
        signedClaSha256: input.signedClaSha256,
        reason: "org_not_found",
      },
    })
    return { status: "org_not_found", reason: "org_not_found" }
  }

  if (latestOrg.claTextSha256 !== input.signedClaSha256) {
    await recordAuditEvent({
      eventType: "signature.pr_sync_superseded",
      orgId: latestOrg.id,
      userId: input.signer.userId,
      actorGithubId: input.signer.githubId,
      actorGithubUsername: input.signer.githubUsername,
      payload: {
        signedClaSha256: input.signedClaSha256,
        latestClaSha256: latestOrg.claTextSha256,
      },
    })
    return { status: "superseded", reason: "cla_changed" }
  }

  if (!latestOrg.isActive) {
    await recordAuditEvent({
      eventType: "signature.pr_sync_skipped",
      orgId: latestOrg.id,
      userId: input.signer.userId,
      actorGithubId: input.signer.githubId,
      actorGithubUsername: input.signer.githubUsername,
      payload: {
        signedClaSha256: input.signedClaSha256,
        reason: "org_inactive",
      },
    })
    return { status: "skipped", reason: "org_inactive" }
  }

  if (!latestOrg.installationId) {
    await recordAuditEvent({
      eventType: "signature.pr_sync_skipped",
      orgId: latestOrg.id,
      userId: input.signer.userId,
      actorGithubId: input.signer.githubId,
      actorGithubUsername: input.signer.githubUsername,
      payload: {
        signedClaSha256: input.signedClaSha256,
        reason: "missing_installation_id",
      },
    })
    return { status: "skipped", reason: "missing_installation_id" }
  }

  try {
    const summary = await runSignerPrSyncStep({
      orgSlug: input.orgSlug,
      installationId: latestOrg.installationId,
      signedClaSha256: input.signedClaSha256,
      signer: input.signer,
      repoName: input.repoName,
      prNumber: input.prNumber,
    })

    const eventType = summary.error ? "signature.pr_sync_failed" : "signature.pr_sync_completed"
    await recordAuditEvent({
      eventType,
      orgId: latestOrg.id,
      userId: input.signer.userId,
      actorGithubId: input.signer.githubId,
      actorGithubUsername: input.signer.githubUsername,
      payload: {
        signedClaSha256: input.signedClaSha256,
        summary,
      },
    })

    if (summary.error) {
      return { status: "failed", error: summary.error, summary }
    }

    return { status: "completed", summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signer PR sync failure"
    await recordAuditEvent({
      eventType: "signature.pr_sync_failed",
      orgId: latestOrg.id,
      userId: input.signer.userId,
      actorGithubId: input.signer.githubId,
      actorGithubUsername: input.signer.githubUsername,
      payload: {
        signedClaSha256: input.signedClaSha256,
        error: message,
      },
    })
    return { status: "failed", error: message }
  }
}

async function loadOrganizationForSync(orgSlug: string): Promise<OrganizationRow> {
  "use step"
  return getOrganizationBySlug(orgSlug)
}

async function recordAuditEvent(input: AuditEventInput) {
  "use step"
  await createAuditEvent(input)
}

async function runSignerPrSyncStep(params: {
  orgSlug: string
  installationId: number
  signedClaSha256: string
  signer: {
    githubId: string | null
    githubUsername: string
  }
  repoName: string | null
  prNumber: number | null
}) {
  "use step"
  return syncSignerOpenPullRequests(params)
}

async function syncSignerOpenPullRequests(params: {
  orgSlug: string
  installationId: number
  signedClaSha256: string
  signer: {
    githubId: string | null
    githubUsername: string
  }
  repoName: string | null
  prNumber: number | null
}): Promise<SignerPrSyncWorkflowSummary> {
  const summary: SignerPrSyncWorkflowSummary = {
    attemptedOpenPrs: 0,
    matchedSignerOpenPrs: 0,
    updatedChecks: 0,
    deletedComments: 0,
    skippedAlreadyPassingChecks: 0,
    skippedMissingCheckRuns: 0,
    skippedMissingComments: 0,
    targetedPrStatus: "not_requested",
    error: null,
  }

  let github: ReturnType<typeof getGitHubClient>
  try {
    github = getGitHubClient(params.installationId)
  } catch (error) {
    summary.error = error instanceof Error ? error.message : "Failed to create GitHub client"
    return summary
  }

  const targetPrs = new Map<
    string,
    {
      repoName: string
      prNumber: number
      headSha: string
    }
  >()

  const addTarget = (repoName: string, prNumber: number, headSha: string) => {
    targetPrs.set(`${repoName}#${prNumber}`, { repoName, prNumber, headSha })
  }

  if (params.repoName && params.prNumber) {
    try {
      const pullRequest = await github.getPullRequest(
        params.orgSlug,
        params.repoName,
        params.prNumber
      )
      if (!pullRequest) {
        summary.targetedPrStatus = "pull_request_not_found"
      } else if (
        !isSignerAuthorForPr(params.signer, pullRequest.authorLogin, pullRequest.authorId)
      ) {
        summary.targetedPrStatus = "signer_not_pr_author"
      } else {
        summary.targetedPrStatus = "matched"
        addTarget(params.repoName, params.prNumber, pullRequest.headSha)
      }
    } catch (error) {
      summary.error =
        error instanceof Error ? error.message : "Failed to load targeted pull request"
      return summary
    }
  }

  let openPrs: Awaited<ReturnType<typeof github.listOpenPullRequestsForOrganization>> = []
  try {
    openPrs = await github.listOpenPullRequestsForOrganization(params.orgSlug)
  } catch (error) {
    summary.error =
      error instanceof Error ? error.message : "Failed to list open pull requests for organization"
    return summary
  }

  summary.attemptedOpenPrs = openPrs.length
  for (const pr of openPrs) {
    if (!isSignerAuthorForPr(params.signer, pr.authorLogin, pr.authorId)) continue
    addTarget(pr.repoName, pr.number, pr.headSha)
  }

  summary.matchedSignerOpenPrs = targetPrs.size
  const versionLabel = params.signedClaSha256.slice(0, 7)

  for (const target of targetPrs.values()) {
    try {
      const latestClaCheck = (
        await github.listCheckRunsForRef(params.orgSlug, target.repoName, target.headSha)
      )
        .filter((check) => check.name === CHECK_NAME)
        .sort((a, b) => b.id - a.id)[0]

      if (!latestClaCheck) {
        summary.skippedMissingCheckRuns += 1
      } else if (latestClaCheck.conclusion === "success") {
        summary.skippedAlreadyPassingChecks += 1
      } else {
        await github.updateCheckRun({
          owner: params.orgSlug,
          repo: target.repoName,
          check_run_id: latestClaCheck.id,
          status: "completed",
          conclusion: "success",
          output: {
            title: "CLA: Signed",
            summary: `@${params.signer.githubUsername} has signed CLA version \`${versionLabel}\`.`,
          },
        })
        summary.updatedChecks += 1
      }

      const existingComment = await github.findBotComment(
        params.orgSlug,
        target.repoName,
        target.prNumber
      )
      if (existingComment && isRemovableClaPromptComment(existingComment.body)) {
        await github.deleteComment({
          owner: params.orgSlug,
          repo: target.repoName,
          comment_id: existingComment.id,
        })
        summary.deletedComments += 1
      } else {
        summary.skippedMissingComments += 1
      }
    } catch {
      summary.error = "Failed to update one or more pull requests"
    }
  }

  return summary
}

function isSignerAuthorForPr(
  user: {
    githubId: string | null
    githubUsername: string
  },
  prAuthorLogin: string,
  prAuthorId?: number
) {
  if (typeof prAuthorId === "number" && user.githubId) {
    return String(prAuthorId) === String(user.githubId)
  }
  return prAuthorLogin.trim().toLowerCase() === user.githubUsername.trim().toLowerCase()
}

function isRemovableClaPromptComment(commentBody: string) {
  return (
    commentBody.includes("Contributor License Agreement Required") ||
    commentBody.includes("Re-signing Required") ||
    commentBody.includes("CLA Bot is not configured for this repository")
  )
}
