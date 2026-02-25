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
