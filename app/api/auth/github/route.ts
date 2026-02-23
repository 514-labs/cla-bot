import { NextRequest, NextResponse } from "next/server"
import { upsertUser } from "@/lib/db/queries"
import { createSessionToken, getSessionCookieOptions } from "@/lib/auth"

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
  const state = searchParams.get("state") // used to carry the return URL

  if (!code) {
    // Step 1: Redirect to GitHub authorize
    const clientId = process.env.GITHUB_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: "GITHUB_CLIENT_ID is not configured" }, { status: 500 })
    }

    const redirectUri = `${new URL(request.url).origin}/api/auth/github`
    // Encode the return URL in state so we can redirect back after login
    const returnTo = searchParams.get("returnTo") || "/dashboard"
    const githubAuthUrl = new URL("https://github.com/login/oauth/authorize")
    githubAuthUrl.searchParams.set("client_id", clientId)
    githubAuthUrl.searchParams.set("redirect_uri", redirectUri)
    githubAuthUrl.searchParams.set("scope", "read:user,read:org")
    githubAuthUrl.searchParams.set("state", returnTo)

    return NextResponse.redirect(githubAuthUrl.toString())
  }

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
    return NextResponse.redirect(new URL("/auth/signin?error=github_token", request.url))
  }

  const accessToken = tokenData.access_token

  // Step 3: Fetch user profile from GitHub API
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  })

  if (!userRes.ok) {
    console.error("GitHub user fetch error:", userRes.status)
    return NextResponse.redirect(new URL("/auth/signin?error=github_user", request.url))
  }

  const githubUser = await userRes.json()

  // Step 4: Upsert user in DB
  const user = await upsertUser({
    githubId: githubUser.id,
    githubUsername: githubUser.login,
    avatarUrl: githubUser.avatar_url,
    name: githubUser.name || githubUser.login,
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

  const returnTo = state || "/dashboard"
  const response = NextResponse.redirect(new URL(returnTo, request.url))
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
