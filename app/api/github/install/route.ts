import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  const { searchParams } = new URL(request.url)
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/admin")

  if (!user) {
    return NextResponse.redirect(
      new URL(`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`, request.url)
    )
  }

  const appSlug = process.env.GITHUB_APP_SLUG
  if (!appSlug) {
    return NextResponse.json({ error: "GITHUB_APP_SLUG is not configured" }, { status: 500 })
  }

  const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`)
  installUrl.searchParams.set("state", returnTo)
  return NextResponse.redirect(installUrl.toString())
}

function sanitizeReturnTo(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}
