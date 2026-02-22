/**
 * Generates the markdown comment posted by the CLA bot on pull requests.
 *
 * Two variants:
 *   1. "unsigned" -- contributor has not signed (or needs to re-sign). Blocks the PR.
 *   2. "signed"   -- contributor has a valid signature. PR is clear to merge.
 */

export function generateUnsignedComment({
  prAuthor,
  orgName,
  orgSlug,
  claVersionLabel,
  appBaseUrl,
  isResign,
}: {
  prAuthor: string
  orgName: string
  orgSlug: string
  /** Short sha256 prefix (7 chars) identifying the CLA version, e.g. "a3f8c1e" */
  claVersionLabel: string
  appBaseUrl: string
  isResign: boolean
}): string {
  const signUrl = `${appBaseUrl}/sign/${orgSlug}?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot`

  const header = isResign
    ? `### CLA Re-signing Required`
    : `### Contributor License Agreement Required`

  const greeting = isResign
    ? `Hey @${prAuthor}, thanks for continuing to contribute to **${orgName}**! The Contributor License Agreement has been updated (version \`${claVersionLabel}\`) since you last signed. Before we can accept this contribution, we need you to review and re-sign the updated agreement.`
    : `Hey @${prAuthor}, thank you for your contribution to **${orgName}**! Before we can accept your changes, we need you to sign our Contributor License Agreement (CLA). This is a one-time process that helps protect both you and the project.`

  return `${header}

${greeting}

> **Why is this required?**
> The CLA ensures that contributions are properly licensed and that both contributors and maintainers are legally protected. It only takes a minute.

**[Sign the CLA](${signUrl})**

Once you've signed, the status check on this PR will update automatically.

---

<sub>Built with love by [fiveonefour.com](https://fiveonefour.com?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot_branding) | [CLA Bot](${appBaseUrl}?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot_branding) automates Contributor License Agreements for GitHub</sub>
`
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
  return `### CLA Signed

All good, @${prAuthor}! You have a valid CLA signature on file for **${orgName}** (version \`${claVersionLabel}\`). This PR is clear to merge from a licensing perspective.

---

<sub>Built with love by [fiveonefour.com](https://fiveonefour.com?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot_branding) | [CLA Bot](${appBaseUrl}?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot_branding) automates Contributor License Agreements for GitHub</sub>
`
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
  return `### CLA Check Skipped

Hey @${prAuthor}, the CLA bot for **${orgName}** is currently inactive. No action needed from you -- this PR is not blocked by CLA requirements.

---

<sub>Built with love by [fiveonefour.com](https://fiveonefour.com?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot_branding) | [CLA Bot](${appBaseUrl}?utm_source=github&utm_medium=pr_comment&utm_campaign=cla_bot_branding) automates Contributor License Agreements for GitHub</sub>
`
}
