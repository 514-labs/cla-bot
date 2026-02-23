import { NextRequest, NextResponse } from "next/server"
import { upsertUser, updateUserGithubAuth } from "@/lib/db/queries"
import { createSessionToken, getSessionCookieOptions } from "@/lib/auth"
import { encryptSecret } from "@/lib/security/encryption"

const OAUTH_STATE_COOKIE = "cla-github-oauth-state"
const OAUTH_STATE_TTL_SECONDS = 60 * 10

type OAuthStateCookie = {
  nonce: string
  returnTo: string
}

/**
 * GitHub OAuth Callback
 *
 * Flow:
 * 1. User clicks "Sign in with GitHub" -> GET with no code -> redirect to GitHub authorize URL
 * 2. GitHub redirects back here with a `code` query param
 * 3. Exchange code for access token
 * 4. Fetch user profile from GitHub API
 * 5. Upsert user in Neon DB
 * 6. Create JWT session cookie
 * 7. Redirect to the original destination (or /dashboard)
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    // Step 1: Redirect to GitHub authorize
    const clientId = process.env.GITHUB_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: "GITHUB_CLIENT_ID is not configured" }, { status: 500 })
    }

    const redirectUri = `${new URL(request.url).origin}/api/auth/github`
    const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/dashboard")
    const nonce = crypto.randomUUID()
    const githubAuthUrl = new URL("https://github.com/login/oauth/authorize")
    githubAuthUrl.searchParams.set("client_id", clientId)
    githubAuthUrl.searchParams.set("redirect_uri", redirectUri)
    githubAuthUrl.searchParams.set("scope", "read:user,read:org")
    githubAuthUrl.searchParams.set("state", nonce)

    const response = NextResponse.redirect(githubAuthUrl.toString())
    response.cookies.set(OAUTH_STATE_COOKIE, encodeOAuthStateCookie({ nonce, returnTo }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SECONDS,
    })
    return response
  }

  const makeAuthErrorRedirect = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/auth/signin?error=${reason}`, request.url))
    clearOAuthStateCookie(response)
    return response
  }

  const oauthState = parseOAuthStateCookie(request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null)
  if (!state || !oauthState || oauthState.nonce !== state) {
    return makeAuthErrorRedirect("github_state")
  }
  const returnTo = sanitizeReturnTo(oauthState.returnTo, "/dashboard")

  // Step 2: Exchange code for access token
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "GitHub OAuth credentials not configured" }, { status: 500 })
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })

  const tokenData = await tokenRes.json()
  if (tokenData.error) {
    console.error("GitHub OAuth token error:", tokenData)
    return makeAuthErrorRedirect("github_token")
  }

  const accessToken = tokenData.access_token
  if (!accessToken) {
    console.error("GitHub OAuth token error: missing access token", tokenData)
    return makeAuthErrorRedirect("github_token")
  }

  // Step 3: Fetch user profile from GitHub API
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  })

  if (!userRes.ok) {
    console.error("GitHub user fetch error:", userRes.status)
    return makeAuthErrorRedirect("github_user")
  }

  const githubUser = await userRes.json()

  // Step 4: Upsert user in DB
  const user = await upsertUser({
    githubId: githubUser.id,
    githubUsername: githubUser.login,
    avatarUrl: githubUser.avatar_url,
    name: githubUser.name || githubUser.login,
  })

  const encryptedAccessToken = encryptSecret(accessToken)
  if (!encryptedAccessToken) {
    console.error(
      "Failed to encrypt GitHub OAuth token: ENCRYPTION_KEY or SESSION_SECRET is missing"
    )
    return makeAuthErrorRedirect("server_config")
  }

  await updateUserGithubAuth(user.id, {
    accessTokenEncrypted: encryptedAccessToken,
    tokenScopes: tokenData.scope ?? "",
  })

  // Step 5: Determine role — check if user is admin of any org
  // For now, use the role from the DB (set during org creation or default "contributor")
  const role = user.role as "admin" | "contributor"

  // Step 6: Create JWT session and set cookie
  const token = await createSessionToken({
    userId: user.id,
    githubUsername: user.githubUsername,
    role,
  })

  const response = NextResponse.redirect(new URL(returnTo, request.url))
  clearOAuthStateCookie(response)
  const cookieOpts = getSessionCookieOptions()
  response.cookies.set(cookieOpts.name, token, {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: cookieOpts.maxAge,
  })

  return response
}

function sanitizeReturnTo(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}

function encodeOAuthStateCookie(value: OAuthStateCookie): string {
  return `${value.nonce}:${encodeURIComponent(value.returnTo)}`
}

function parseOAuthStateCookie(raw: string | null): OAuthStateCookie | null {
  if (!raw) return null
  const separatorIndex = raw.indexOf(":")
  if (separatorIndex <= 0) return null

  const nonce = raw.slice(0, separatorIndex)
  const encodedReturnTo = raw.slice(separatorIndex + 1)
  if (!nonce || !encodedReturnTo) return null

  try {
    return {
      nonce,
      returnTo: decodeURIComponent(encodedReturnTo),
    }
  } catch {
    return null
  }
}

function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}
