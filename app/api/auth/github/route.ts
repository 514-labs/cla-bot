import { NextRequest, NextResponse } from "next/server"

/**
 * GitHub OAuth Callback
 *
 * Flow:
 * 1. User clicks "Sign in with GitHub" -> redirect to GitHub authorize URL
 * 2. GitHub redirects back here with a `code` query param
 * 3. Exchange code for access token
 * 4. Fetch user profile from GitHub API
 * 5. Upsert user in Neon DB
 * 6. Create session (set HTTP-only cookie)
 * 7. Redirect to /dashboard
 *
 * Required env vars:
 *   - GITHUB_CLIENT_ID
 *   - GITHUB_CLIENT_SECRET
 *   - DATABASE_URL (Neon)
 *   - SESSION_SECRET
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")

  if (!code) {
    // Redirect to GitHub authorize
    const clientId = process.env.GITHUB_CLIENT_ID || "your-client-id"
    const redirectUri = `${new URL(request.url).origin}/api/auth/github`
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,read:org`

    return NextResponse.redirect(githubAuthUrl)
  }

  // In production:
  // 1. Exchange code for token
  // const tokenRes = await fetch("https://github.com/login/oauth/access_token", { ... })
  //
  // 2. Fetch user
  // const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } })
  //
  // 3. Upsert in DB
  // await sql`INSERT INTO users (github_id, username, name, avatar_url) VALUES (...) ON CONFLICT ...`
  //
  // 4. Set session cookie
  // const session = sign({ userId, role }, process.env.SESSION_SECRET)
  // response.cookies.set("session", session, { httpOnly: true, secure: true, sameSite: "lax" })

  const response = NextResponse.redirect(new URL("/dashboard", request.url))
  return response
}
