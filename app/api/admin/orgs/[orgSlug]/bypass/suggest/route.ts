import { type NextRequest, NextResponse } from "next/server"
import { getBypassAccountsByOrg } from "@/lib/db/queries"
import { searchGitHubUsersWithOAuth } from "@/lib/github/oauth-user-search"
import { authorizeOrgAccess } from "@/lib/server/org-access"
import { decryptSecret } from "@/lib/security/encryption"
import {
  formatBypassActorLogin,
  isLikelyAppBotActor,
  normalizeBypassActorSlug,
  parseBypassKind,
} from "@/lib/bypass"

const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 8

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status })
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  const bypassKind = parseBypassKind(request.nextUrl.searchParams.get("kind")) ?? "user"
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] })
  }

  const bypassAccounts = await getBypassAccountsByOrg(access.org.id)

  const appBotBypassedActorSlugs = new Set(
    bypassAccounts
      .filter((entry) => entry.bypassKind === "app_bot")
      .map((entry) => normalizeBypassActorSlug(entry.actorSlug ?? entry.githubUsername))
      .filter(Boolean)
  )

  const toManualAppBotSuggestion = () => {
    const actorSlug = normalizeBypassActorSlug(query)
    if (!actorSlug) return null
    return {
      kind: "app_bot" as const,
      actorSlug,
      githubUsername: formatBypassActorLogin(actorSlug),
      avatarUrl: "",
      type: "Bot" as const,
      alreadyBypassed: appBotBypassedActorSlugs.has(actorSlug),
      source: "manual" as const,
    }
  }

  const encryptedToken = access.user.githubAccessTokenEncrypted ?? null
  const accessToken = encryptedToken ? decryptSecret(encryptedToken) : null
  if (!accessToken) {
    if (bypassKind === "app_bot") {
      const manualSuggestion = toManualAppBotSuggestion()
      return NextResponse.json({ suggestions: manualSuggestion ? [manualSuggestion] : [] })
    }

    return NextResponse.json(
      { error: "Missing GitHub OAuth token. Sign out and sign back in to enable autocomplete." },
      { status: 400 }
    )
  }

  try {
    const suggestions = await searchGitHubUsersWithOAuth({
      accessToken,
      query,
      limit: MAX_SUGGESTIONS,
    })

    if (bypassKind === "user") {
      const bypassIds = new Set(
        bypassAccounts
          .filter((entry) => entry.bypassKind === "user")
          .map((entry) => entry.githubUserId)
          .filter((value): value is string => Boolean(value))
      )

      return NextResponse.json({
        suggestions: suggestions
          .filter((item) => item.type !== "Bot")
          .map((item) => ({
            kind: "user" as const,
            ...item,
            alreadyBypassed: bypassIds.has(item.githubUserId),
          })),
      })
    }

    const appBotSuggestionMap = new Map<
      string,
      {
        kind: "app_bot"
        actorSlug: string
        githubUsername: string
        avatarUrl: string
        type: "Bot"
        alreadyBypassed: boolean
        source: "github" | "manual"
      }
    >()

    for (const item of suggestions) {
      if (!isLikelyAppBotActor({ login: item.githubUsername, type: item.type })) continue

      const actorSlug = normalizeBypassActorSlug(item.githubUsername)
      if (!actorSlug) continue

      appBotSuggestionMap.set(actorSlug, {
        kind: "app_bot",
        actorSlug,
        githubUsername: formatBypassActorLogin(actorSlug),
        avatarUrl: item.avatarUrl,
        type: "Bot",
        alreadyBypassed: appBotBypassedActorSlugs.has(actorSlug),
        source: "github",
      })
    }

    const manualSuggestion = toManualAppBotSuggestion()
    if (manualSuggestion && !appBotSuggestionMap.has(manualSuggestion.actorSlug)) {
      appBotSuggestionMap.set(manualSuggestion.actorSlug, manualSuggestion)
    }

    return NextResponse.json({
      suggestions: Array.from(appBotSuggestionMap.values()).slice(0, MAX_SUGGESTIONS),
    })
  } catch (error) {
    console.error("GitHub bypass autocomplete failed:", error)
    if (bypassKind === "app_bot") {
      const manualSuggestion = toManualAppBotSuggestion()
      if (manualSuggestion) {
        return NextResponse.json({ suggestions: [manualSuggestion] })
      }
    }
    return NextResponse.json({ error: "Failed to fetch GitHub user suggestions" }, { status: 502 })
  }
}
