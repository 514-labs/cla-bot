export type BypassKind = "user" | "app_bot"

const BOT_SUFFIX = "[bot]"
const BYPASS_KINDS = new Set<BypassKind>(["user", "app_bot"])

export function parseBypassKind(value: unknown): BypassKind | null {
  if (typeof value !== "string") return null
  if (!BYPASS_KINDS.has(value as BypassKind)) return null
  return value as BypassKind
}

export function normalizeBypassUsername(input: string) {
  return input.trim().replace(/^@/, "").toLowerCase()
}

export function normalizeBypassActorSlug(input: string) {
  const normalized = normalizeBypassUsername(input)
  if (!normalized) return ""
  if (normalized.endsWith(BOT_SUFFIX)) {
    return normalized.slice(0, -BOT_SUFFIX.length)
  }
  return normalized
}

export function formatBypassActorLogin(actorSlug: string) {
  const normalized = normalizeBypassActorSlug(actorSlug)
  if (!normalized) return ""
  return `${normalized}${BOT_SUFFIX}`
}

export function getBypassActorLoginCandidates(input: string) {
  const actorSlug = normalizeBypassActorSlug(input)
  if (!actorSlug) return []

  const actorLogin = formatBypassActorLogin(actorSlug)
  if (actorLogin === actorSlug) return [actorSlug]
  return [actorSlug, actorLogin]
}

export function isLikelyAppBotActor(params: { login: string; type?: string }) {
  const login = params.login.toLowerCase()
  if (params.type === "Bot") return true
  return login.endsWith(BOT_SUFFIX) || login.includes("dependabot")
}

export type BypassAccountLike = {
  /** Stored as plain text in the DB; compared against the known kinds. */
  bypassKind: string
  githubUserId: string | null
  githubUsername: string
  actorSlug: string | null
}

/**
 * Pick the bypass entry that applies to a PR author from an org's full bypass
 * list, using the same precedence the per-row lookups used to apply one query
 * at a time:
 *   1. user entry matching the immutable GitHub id
 *   2. user entry matching the login (case-insensitive)
 *   3. app/bot entry whose actor slug matches the login (with or without "[bot]")
 *   4. app/bot entry whose stored login matches the login or its "[bot]" form
 *
 * Pure function so the webhook can fetch the (small) list once and decide in
 * memory instead of issuing up to five sequential round trips.
 */
export function selectBypassAccount<T extends BypassAccountLike>(
  accounts: readonly T[],
  author: { githubUserId?: string | number | null; githubUsername?: string | null }
): T | null {
  const githubUserId =
    author.githubUserId === undefined || author.githubUserId === null
      ? ""
      : String(author.githubUserId).trim()
  if (githubUserId) {
    const byId = accounts.find(
      (account) => account.bypassKind === "user" && account.githubUserId === githubUserId
    )
    if (byId) return byId
  }

  const login =
    typeof author.githubUsername === "string" ? normalizeBypassUsername(author.githubUsername) : ""
  if (!login) return null

  const byLogin = accounts.find(
    (account) =>
      account.bypassKind === "user" && normalizeBypassUsername(account.githubUsername) === login
  )
  if (byLogin) return byLogin

  const actorSlug = normalizeBypassActorSlug(login)
  if (actorSlug) {
    const byActorSlug = accounts.find(
      (account) =>
        account.bypassKind === "app_bot" &&
        account.actorSlug !== null &&
        normalizeBypassActorSlug(account.actorSlug) === actorSlug
    )
    if (byActorSlug) return byActorSlug
  }

  for (const candidate of getBypassActorLoginCandidates(login)) {
    const byActorLogin = accounts.find(
      (account) =>
        account.bypassKind === "app_bot" &&
        normalizeBypassUsername(account.githubUsername) === candidate
    )
    if (byActorLogin) return byActorLogin
  }

  return null
}
