import {
  getOrganizationBySlug,
  isBypassAccountForOrg,
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
  passedBypassChecks: number
  commentsCreated: number
  commentsUpdated: number
  commentsDeleted: number
  skippedOrgMembers: number
  skippedCompliant: number
  skippedBypass: number
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
    passedBypassChecks: 0,
    commentsCreated: 0,
    commentsUpdated: 0,
    commentsDeleted: 0,
    skippedOrgMembers: 0,
    skippedCompliant: 0,
    skippedBypass: 0,
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
      const bypassAccount = await isBypassAccountForOrg({
        orgId: org.id,
        githubUserId: pr.authorId,
        githubUsername: pr.authorLogin,
      })
      if (bypassAccount) {
        await github.createCheckRun({
          owner: params.orgSlug,
          repo: pr.repoName,
          name: CHECK_NAME,
          head_sha: pr.headSha,
          status: "completed",
          conclusion: "success",
          output: {
            title: "CLA: Bypassed",
            summary: `@${pr.authorLogin} is on the CLA bypass list for @${params.orgSlug}.`,
          },
        })
        summary.passedBypassChecks += 1
        summary.skippedBypass += 1

        const existingComment = await github.findBotComment(params.orgSlug, pr.repoName, pr.number)
        if (existingComment && isRemovableClaPromptComment(existingComment.body)) {
          await github.deleteComment({
            owner: params.orgSlug,
            repo: pr.repoName,
            comment_id: existingComment.id,
          })
          summary.commentsDeleted += 1
        }

        summary.rechecked += 1
        continue
      }

      const accountOwner = isPersonalAccountOwner(org, pr.authorLogin, pr.authorId)
      if (accountOwner) {
        summary.skippedOrgMembers += 1
        continue
      }

      const membership =
        org.githubAccountType === "user"
          ? "not_member"
          : await github.checkOrgMembership(params.orgSlug, pr.authorLogin)
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

function isRemovableClaPromptComment(commentBody: string) {
  return (
    commentBody.includes("Contributor License Agreement Required") ||
    commentBody.includes("Re-signing Required") ||
    commentBody.includes("CLA Bot is not configured for this repository")
  )
}
