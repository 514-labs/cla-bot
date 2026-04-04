import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

const COOKIE_NAME = "cla-session"

const PROTECTED_PAGE_PREFIXES = ["/admin", "/contributor"]
const PROTECTED_API_PREFIXES = ["/api/orgs", "/api/contributor", "/api/github/install"]

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p))
  const isProtectedApi = PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next()

  const token = request.cookies.get(COOKIE_NAME)?.value
  const isValid = token ? await verifyToken(token) : false

  if (!isValid) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const signinUrl = new URL("/auth/signin", request.url)
    signinUrl.searchParams.set("returnTo", pathname + request.nextUrl.search)
    signinUrl.searchParams.set("reason", "session_expired")
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
}

async function verifyToken(token: string): Promise<boolean> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch {
    return false
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/contributor/:path*",
    "/api/orgs/:path*",
    "/api/contributor/:path*",
    "/api/github/install/:path*",
  ],
}
