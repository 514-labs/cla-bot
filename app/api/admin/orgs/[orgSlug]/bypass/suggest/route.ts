import { type NextRequest, NextResponse } from "next/server"
import { getBypassAccountsByOrg } from "@/lib/db/queries"
import { searchGitHubUsersWithOAuth } from "@/lib/github/oauth-user-search"
import { authorizeOrgAccess } from "@/lib/server/org-access"
import { decryptSecret } from "@/lib/security/encryption"

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
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] })
  }

  const encryptedToken = access.user.githubAccessTokenEncrypted ?? null
  const accessToken = encryptedToken ? decryptSecret(encryptedToken) : null
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing GitHub OAuth token. Sign out and sign back in to enable autocomplete." },
      { status: 400 }
    )
  }

  try {
    const [suggestions, bypassAccounts] = await Promise.all([
      searchGitHubUsersWithOAuth({
        accessToken,
        query,
        limit: MAX_SUGGESTIONS,
      }),
      getBypassAccountsByOrg(access.org.id),
    ])

    const bypassIds = new Set(bypassAccounts.map((entry) => entry.githubUserId))
    return NextResponse.json({
      suggestions: suggestions.map((item) => ({
        ...item,
        alreadyBypassed: bypassIds.has(item.githubUserId),
      })),
    })
  } catch (error) {
    console.error("GitHub bypass autocomplete failed:", error)
    return NextResponse.json({ error: "Failed to fetch GitHub user suggestions" }, { status: 502 })
  }
}
