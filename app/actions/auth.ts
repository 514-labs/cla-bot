"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionCookieOptions, getSessionPayload } from "@/lib/auth"
import { signOutUser } from "@/lib/server/sign-out"

export async function signOutAction() {
  // Revoke the GitHub grant, clear the stored tokens, and write the audit
  // event before the cookie goes away. Best-effort: never blocks sign-out.
  const payload = await getSessionPayload()
  if (payload?.userId) {
    await signOutUser(payload.userId, payload.githubUsername ?? null)
  }

  const cookieStore = await cookies()
  const cookieOpts = getSessionCookieOptions()

  cookieStore.set(cookieOpts.name, "", {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0,
  })

  redirect("/")
}
