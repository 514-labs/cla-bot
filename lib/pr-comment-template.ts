/**
 * Generates the markdown comment posted by the CLA bot on pull requests.
 *
 * Two variants:
 *   1. "unsigned" -- contributor has not signed (or needs to re-sign). Blocks the PR.
 *   2. "signed"   -- contributor has a valid signature. PR is clear to merge.
 */
import { buildFiveonefourUrl } from "@/lib/marketing-links"

export const CLA_BOT_COMMENT_SIGNATURE = "<!-- cla-bot:managed-comment:v1 -->"

export function isClaBotManagedComment(body: string) {
  return body.includes(CLA_BOT_COMMENT_SIGNATURE)
}

function withClaBotSignature(body: string) {
  return `${CLA_BOT_COMMENT_SIGNATURE}\n${body}`
}

function buildBrandingFooter(appBaseUrl: string, context: "unsigned" | "signed" | "inactive") {
  const fiveonefourUrl = buildFiveonefourUrl({
    medium: "github_pr_comment",
    content: `branding_${context}`,
  })
  const claBotUrl = `${appBaseUrl}?utm_source=cla_bot&utm_medium=github_pr_comment&utm_campaign=fiveonefour_referral&utm_content=cla_bot_${context}`

  return `<sub>Built with love by [fiveonefour.com](${fiveonefourUrl}) | [CLA Bot](${claBotUrl}) automates Contributor License Agreements for GitHub</sub>`
}

export function generateUnsignedComment({
  prAuthor,
  orgName,
  orgSlug,
  repoName,
  prNumber,
  claVersionLabel,
  appBaseUrl,
  isResign,
}: {
  prAuthor: string
  orgName: string
  orgSlug: string
  repoName: string
  prNumber: number
  /** Short sha256 prefix (7 chars) identifying the CLA version, e.g. "a3f8c1e" */
  claVersionLabel: string
  appBaseUrl: string
  isResign: boolean
}): string {
  const signUrl = `${appBaseUrl}/sign/${orgSlug}?repo=${encodeURIComponent(repoName)}&pr=${prNumber}&utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot`

  const header = isResign
    ? `### CLA Re-signing Required`
    : `### Contributor License Agreement Required`

  const greeting = isResign
    ? `Hey @${prAuthor}, thanks for continuing to contribute to **${orgName}**! The Contributor License Agreement has been updated (version \`${claVersionLabel}\`) since you last signed. Before we can accept this contribution, we need you to review and re-sign the updated agreement.`
    : `Hey @${prAuthor}, thank you for your contribution to **${orgName}**! Before we can accept your changes, we need you to sign our Contributor License Agreement (CLA). This is a one-time process that helps protect both you and the project.`

  return withClaBotSignature(`${header}

${greeting}

> **Why is this required?**
> The CLA ensures that contributions are properly licensed and that both contributors and maintainers are legally protected. It only takes a minute.

**[Sign the CLA](${signUrl})**

Once you've signed, the status check on this PR will update automatically.

---

${buildBrandingFooter(appBaseUrl, "unsigned")}
`)
}

export function generateSignedComment({
  prAuthor,
  orgName,
  claVersionLabel,
  appBaseUrl,
}: {
  prAuthor: string
  orgName: string
  /** Short sha256 prefix, e.g. "a3f8c1e" */
  claVersionLabel: string
  appBaseUrl: string
}): string {
  return withClaBotSignature(`### CLA Signed

All good, @${prAuthor}! You have a valid CLA signature on file for **${orgName}** (version \`${claVersionLabel}\`). This PR is clear to merge from a licensing perspective.

---

${buildBrandingFooter(appBaseUrl, "signed")}
`)
}

export function generateInactiveComment({
  prAuthor,
  orgName,
  appBaseUrl,
}: {
  prAuthor: string
  orgName: string
  appBaseUrl: string
}): string {
  return withClaBotSignature(`### CLA Check Skipped

Hey @${prAuthor}, the CLA bot for **${orgName}** is currently inactive. No action needed from you -- this PR is not blocked by CLA requirements.

---

${buildBrandingFooter(appBaseUrl, "inactive")}
`)
}
