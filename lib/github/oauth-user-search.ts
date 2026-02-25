type SearchGitHubUsersResult = {
  githubUserId: string
  githubUsername: string
  avatarUrl: string
  type: "User" | "Organization" | "Bot"
}

export async function searchGitHubUsersWithOAuth(params: {
  accessToken: string
  query: string
  limit?: number
}) {
  const normalizedQuery = params.query.trim()
  if (!normalizedQuery) return []

  const perPage = Math.max(1, Math.min(params.limit ?? 8, 20))
  const url = new URL("https://api.github.com/search/users")
  url.searchParams.set("q", `${normalizedQuery} in:login`)
  url.searchParams.set("per_page", String(perPage))

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`GitHub user search failed (${response.status})`)
  }

  const body = (await response.json()) as {
    items?: Array<{
      id?: number
      login?: string
      avatar_url?: string
      type?: "User" | "Organization" | "Bot"
    }>
  }
  const items = Array.isArray(body.items) ? body.items : []

  return items
    .filter((item) => typeof item.id === "number" && typeof item.login === "string")
    .map(
      (item): SearchGitHubUsersResult => ({
        githubUserId: String(item.id),
        githubUsername: item.login ?? "",
        avatarUrl: item.avatar_url ?? "",
        type: item.type ?? "User",
      })
    )
}
