import {
  getOrganizationBySlug,
  getSignatureStatusByGithubId,
  getSignatureStatusByUsername,
} from "@/lib/db/queries"
import { getGitHubClient } from "@/lib/github"
import { generateUnsignedComment } from "@/lib/pr-comment-template"

const CHECK_NAME = "CLA Bot / Contributor License Agreement"

export type ClaOpenPrRecheckSummary = {
  attempted: number
  rechecked: number
  failedChecks: number
  commentsCreated: number
  commentsUpdated: number
  skippedOrgMembers: number
  skippedCompliant: number
  recheckErrors: number
  skippedInactive: boolean
  error: string | null
}

export async function recheckOpenPullRequestsAfterClaUpdate(params: {
  orgSlug: string
  appBaseUrl: string
  installationId?: number
}): Promise<ClaOpenPrRecheckSummary> {
  const summary: ClaOpenPrRecheckSummary = {
    attempted: 0,
    rechecked: 0,
    failedChecks: 0,
    commentsCreated: 0,
    commentsUpdated: 0,
    skippedOrgMembers: 0,
    skippedCompliant: 0,
    recheckErrors: 0,
    skippedInactive: false,
    error: null,
  }

  const org = await getOrganizationBySlug(params.orgSlug)
  if (!org) {
    summary.error = `Organization "${params.orgSlug}" not found`
    return summary
  }

  if (!org.isActive) {
    summary.skippedInactive = true
    return summary
  }

  const resolvedInstallationId = params.installationId ?? org.installationId ?? undefined
  let github: ReturnType<typeof getGitHubClient>
  try {
    github = getGitHubClient(resolvedInstallationId)
  } catch (err) {
    summary.error =
      err instanceof Error ? err.message : "GitHub client is not configured for this organization"
    return summary
  }

  let openPrs: Awaited<ReturnType<typeof github.listOpenPullRequestsForOrganization>> = []
  try {
    openPrs = await github.listOpenPullRequestsForOrganization(params.orgSlug)
  } catch (err) {
    summary.error =
      err instanceof Error ? err.message : "Failed to list open pull requests for organization"
    return summary
  }
  summary.attempted = openPrs.length

  const versionLabel = org.claTextSha256 ? org.claTextSha256.slice(0, 7) : "unknown"

  for (const pr of openPrs) {
    try {
      const membership = await github.checkOrgMembership(params.orgSlug, pr.authorLogin)
      if (membership === "active") {
        summary.skippedOrgMembers += 1
        continue
      }

      const sigStatus =
        typeof pr.authorId === "number"
          ? await getSignatureStatusByGithubId(params.orgSlug, String(pr.authorId))
          : await getSignatureStatusByUsername(params.orgSlug, pr.authorLogin)
      const isSignedCurrent = sigStatus.signed && sigStatus.currentVersion
      if (isSignedCurrent) {
        summary.skippedCompliant += 1
        continue
      }

      const needsResign = sigStatus.signed && !sigStatus.currentVersion

      await github.createCheckRun({
        owner: params.orgSlug,
        repo: pr.repoName,
        name: CHECK_NAME,
        head_sha: pr.headSha,
        status: "completed",
        conclusion: "failure",
        output: {
          title: needsResign ? "CLA: Re-signing required" : "CLA: Signature required",
          summary: needsResign
            ? `@${pr.authorLogin} signed an older CLA. Please re-sign (version \`${versionLabel}\`).`
            : `@${pr.authorLogin} has not signed the CLA for ${params.orgSlug}. Please sign to continue.`,
        },
      })
      summary.failedChecks += 1

      const commentBody = generateUnsignedComment({
        prAuthor: pr.authorLogin,
        orgName: org.name,
        orgSlug: org.githubOrgSlug,
        repoName: pr.repoName,
        prNumber: pr.number,
        claVersionLabel: versionLabel,
        appBaseUrl: params.appBaseUrl,
        isResign: needsResign,
      })

      const existingComment = await github.findBotComment(params.orgSlug, pr.repoName, pr.number)
      if (existingComment) {
        await github.updateComment({
          owner: params.orgSlug,
          repo: pr.repoName,
          comment_id: existingComment.id,
          body: commentBody,
        })
        summary.commentsUpdated += 1
      } else {
        await github.createComment({
          owner: params.orgSlug,
          repo: pr.repoName,
          issue_number: pr.number,
          body: commentBody,
        })
        summary.commentsCreated += 1
      }

      summary.rechecked += 1
    } catch {
      summary.recheckErrors += 1
    }
  }

  return summary
}
