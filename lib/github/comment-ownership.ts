import type { GitHubClient } from "./client"
import type { IssueComment } from "./types"
import { isClaBotManagedComment } from "@/lib/pr-comment-template"

/**
 * Comment ownership for the CLA bot.
 *
 * The `<!-- cla-bot:managed-comment:v1 -->` marker is public: anyone who can
 * comment on a PR can paste it. The marker alone therefore never proves that a
 * comment belongs to us. Ownership additionally requires that the comment was
 * authored by this GitHub App's bot identity (`<app-slug>[bot]`, type "Bot"),
 * and -- when GitHub reports it -- that it was performed via this App's ID.
 *
 * When `GITHUB_APP_SLUG` is unset the check fails closed: no comment is treated
 * as ours, so callers post a fresh comment rather than editing someone else's.
 */

let warnedMissingAppSlug = false

/** Test hook: allow the "GITHUB_APP_SLUG missing" warning to fire again. */
export function resetCommentOwnershipWarnings() {
  warnedMissingAppSlug = false
}

/**
 * The GitHub login of this App's bot identity (`<slug>[bot]`), or `null` when
 * `GITHUB_APP_SLUG` is not configured.
 */
export function getExpectedBotLogin(): string | null {
  const slug = process.env.GITHUB_APP_SLUG?.trim()
  if (!slug) {
    if (!warnedMissingAppSlug) {
      warnedMissingAppSlug = true
      console.warn(
        "[comment-ownership] GITHUB_APP_SLUG is not set; no PR comment will be treated as owned by the CLA bot. Existing CLA comments cannot be updated or deleted until it is configured."
      )
    }
    return null
  }
  return `${slug}[bot]`
}

function getExpectedAppId(): number | null {
  const raw = process.env.GITHUB_APP_ID?.trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** True when `comment` was authored by this App's bot identity. */
function isAuthoredByClaBot(comment: IssueComment, botLogin = getExpectedBotLogin()) {
  if (!botLogin) return false
  if (comment.user?.type !== "Bot") return false
  if ((comment.user.login ?? "").toLowerCase() !== botLogin.toLowerCase()) return false

  // Defense in depth: when GitHub tells us which App performed the comment,
  // require it to be ours.
  const appId = comment.performed_via_github_app_id
  const expectedAppId = getExpectedAppId()
  if (typeof appId === "number" && expectedAppId !== null && appId !== expectedAppId) {
    return false
  }
  return true
}

/** True when `comment` carries our marker AND was authored by our bot. */
export function isManagedClaBotComment(comment: IssueComment, botLogin = getExpectedBotLogin()) {
  return isClaBotManagedComment(comment.body) && isAuthoredByClaBot(comment, botLogin)
}

export function findLatestManagedClaBotComment(comments: IssueComment[]): IssueComment | null {
  const botLogin = getExpectedBotLogin()
  if (!botLogin) return null

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const candidate = comments[index]
    if (isManagedClaBotComment(candidate, botLogin)) return candidate
  }
  return null
}

/**
 * Look up the CLA bot's comment on a PR and re-verify ownership before handing
 * it to a caller that will update or delete it. Every write path to an existing
 * comment must go through this so a marker-only match can never be acted on.
 */
export async function findOwnedClaBotComment(
  github: Pick<GitHubClient, "findBotComment">,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<IssueComment | null> {
  const comment = await github.findBotComment(owner, repo, issueNumber)
  if (!comment || !isManagedClaBotComment(comment)) return null
  return comment
}
