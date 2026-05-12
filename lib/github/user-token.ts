import "server-only"
import { clearUserGithubTokens, getUserById, rotateUserGithubTokens } from "@/lib/db/queries"
import { decryptSecret, encryptSecret } from "@/lib/security/encryption"

const REFRESH_BUFFER_MS = 60_000 // refresh when within 60s of expiry

/**
 * In-process coalescing so concurrent callers inside one Node instance share
 * a single refresh round-trip. Cross-instance races are still resolved by
 * the optimistic update in rotateUserGithubTokens + a single re-SELECT retry.
 */
const inFlight = new Map<string, Promise<string | null>>()

type RefreshTokenSuccess = {
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_token_expires_in: number
  scope?: string
  token_type?: string
}

type RefreshTokenError = {
  error: string
  error_description?: string
}

/**
 * Return a valid GitHub App user access token for the given user, refreshing
 * if it is within 60s of expiry. Returns null when the user has no usable
 * tokens (legacy row, refresh token expired or revoked, etc.) — the caller
 * should treat this as "needs re-auth" and surface the re-auth banner.
 */
export async function getValidUserAccessToken(userId: string): Promise<string | null> {
  const existing = inFlight.get(userId)
  if (existing) return existing

  const promise = resolveAccessToken(userId).finally(() => {
    inFlight.delete(userId)
  })
  inFlight.set(userId, promise)
  return promise
}

async function resolveAccessToken(userId: string): Promise<string | null> {
  const user = await getUserById(userId)
  if (!user) return null
  if (user.githubTokenKind !== "refreshable") return null

  const accessTokenEnc = user.githubAccessTokenEncrypted
  const accessExpiry = user.githubAccessTokenExpiresAt
  if (accessTokenEnc && accessExpiry && !isExpiringSoon(accessExpiry)) {
    const decrypted = decryptSecret(accessTokenEnc)
    if (decrypted) return decrypted
  }

  const refreshTokenEnc = user.githubRefreshTokenEncrypted
  const refreshExpiry = user.githubRefreshTokenExpiresAt
  if (!refreshTokenEnc || !refreshExpiry || new Date(refreshExpiry).getTime() <= Date.now()) {
    await clearUserGithubTokens(userId)
    return null
  }

  const decryptedRefresh = decryptSecret(refreshTokenEnc)
  if (!decryptedRefresh) {
    await clearUserGithubTokens(userId)
    return null
  }

  return refreshAndPersist(userId, refreshTokenEnc, decryptedRefresh)
}

async function refreshAndPersist(
  userId: string,
  oldRefreshTokenEnc: string,
  decryptedRefresh: string
): Promise<string | null> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error("[user-token] Missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET; cannot refresh")
    return null
  }

  let response: Response
  try {
    response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: decryptedRefresh,
      }),
    })
  } catch (error) {
    console.error("[user-token] Refresh request failed", error)
    return null
  }

  let body: RefreshTokenSuccess | RefreshTokenError
  try {
    body = (await response.json()) as RefreshTokenSuccess | RefreshTokenError
  } catch {
    console.error("[user-token] Refresh response was not JSON")
    return null
  }

  if ("error" in body) {
    if (body.error === "bad_refresh_token" || body.error === "unauthorized") {
      // Either GitHub revoked the grant, or a peer already consumed this single-use
      // refresh token. Re-SELECT once; if the peer wrote a fresh access token, use it.
      const peer = await readFreshAccessToken(userId)
      if (peer) return peer
      await clearUserGithubTokens(userId)
      return null
    }
    console.error("[user-token] Refresh returned error", body)
    return null
  }

  const now = Date.now()
  const accessTokenExpiresAt = new Date(now + body.expires_in * 1000).toISOString()
  const refreshTokenExpiresAt = new Date(now + body.refresh_token_expires_in * 1000).toISOString()
  const accessTokenEncrypted = encryptSecret(body.access_token)
  const refreshTokenEncrypted = encryptSecret(body.refresh_token)
  if (!accessTokenEncrypted || !refreshTokenEncrypted) {
    console.error("[user-token] Encryption failed during refresh persist")
    return null
  }

  const updated = await rotateUserGithubTokens(userId, {
    expectedRefreshTokenEncrypted: oldRefreshTokenEnc,
    next: {
      accessTokenEncrypted,
      accessTokenExpiresAt,
      refreshTokenEncrypted,
      refreshTokenExpiresAt,
      tokenScopes: body.scope ?? null,
    },
  })

  if (updated) return body.access_token

  // Lost the optimistic-update race: a peer rotated before us. Their new tokens
  // are now in the DB; ours just got invalidated by GitHub on the same call.
  // Re-SELECT and return whatever's current.
  return readFreshAccessToken(userId)
}

async function readFreshAccessToken(userId: string): Promise<string | null> {
  const user = await getUserById(userId)
  if (!user) return null
  if (user.githubTokenKind !== "refreshable") return null
  if (!user.githubAccessTokenEncrypted || !user.githubAccessTokenExpiresAt) return null
  if (isExpiringSoon(user.githubAccessTokenExpiresAt)) return null
  return decryptSecret(user.githubAccessTokenEncrypted)
}

function isExpiringSoon(isoTimestamp: string): boolean {
  const expiresAtMs = new Date(isoTimestamp).getTime()
  return Number.isFinite(expiresAtMs) ? expiresAtMs - Date.now() <= REFRESH_BUFFER_MS : true
}

/**
 * Best-effort upstream revocation followed by DB clear. Safe to fire-and-forget
 * from the logout handler — errors are logged but not surfaced.
 */
export async function revokeUserGithubTokens(userId: string): Promise<void> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  try {
    const user = await getUserById(userId)
    const encrypted = user?.githubAccessTokenEncrypted
    const accessToken = encrypted ? decryptSecret(encrypted) : null

    if (accessToken && clientId && clientSecret) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
      // /grant (not /token) revokes the user's entire authorization for the App —
      // both the current access token and the long-lived refresh token. /token
      // would leave the 6-month refresh token usable until natural expiry.
      const response = await fetch(
        `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Basic ${basic}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: accessToken }),
        }
      )
      if (!response.ok && response.status !== 404) {
        console.warn("[user-token] Revoke responded", response.status)
      }
    }
  } catch (error) {
    console.warn("[user-token] Revoke failed; clearing DB anyway", error)
  }

  try {
    await clearUserGithubTokens(userId)
  } catch (error) {
    console.error("[user-token] Failed to clear tokens after revoke", error)
  }
}
