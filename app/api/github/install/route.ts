import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"

const INSTALL_PENDING_COOKIE = "cla-install-pending"
const INSTALL_PENDING_TTL_SECONDS = 180

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const requestedReturnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/admin")
  const callbackReturnTo = sanitizeReturnTo(searchParams.get("state"), requestedReturnTo)
  const setupAction = searchParams.get("setup_action")
  const installationId = searchParams.get("installation_id")
  const hasCallbackOnlyState =
    typeof searchParams.get("state") === "string" && !searchParams.has("returnTo")
  const isInstallCallback =
    typeof installationId === "string" || typeof setupAction === "string" || hasCallbackOnlyState
  const callbackUrl = buildCallbackUrl(request, callbackReturnTo, setupAction, installationId)

  const user = await getSessionUser()

  if (!user) {
    const postAuthReturnTo = isInstallCallback ? toRelativePath(callbackUrl) : callbackReturnTo
    return NextResponse.redirect(
      new URL(`/auth/signin?returnTo=${encodeURIComponent(postAuthReturnTo)}`, request.url)
    )
  }

  if (isInstallCallback) {
    return NextResponse.redirect(callbackUrl)
  }

  const appSlug = process.env.GITHUB_APP_SLUG
  if (!appSlug) {
    return NextResponse.json({ error: "GITHUB_APP_SLUG is not configured" }, { status: 500 })
  }

  const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`)
  installUrl.searchParams.set("state", requestedReturnTo)
  const response = NextResponse.redirect(installUrl.toString())
  response.cookies.set(INSTALL_PENDING_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: INSTALL_PENDING_TTL_SECONDS,
  })
  return response
}

function sanitizeReturnTo(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}

function buildCallbackUrl(
  request: NextRequest,
  callbackReturnTo: string,
  setupAction: string | null,
  installationId: string | null
): URL {
  const url = new URL(callbackReturnTo, request.url)
  url.searchParams.set("fromInstall", "1")
  if (setupAction) {
    url.searchParams.set("setup_action", setupAction)
  }
  if (installationId) {
    url.searchParams.set("installation_id", installationId)
  }
  return url
}

function toRelativePath(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`
}
