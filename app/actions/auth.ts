"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionCookieOptions } from "@/lib/auth"

export async function signOutAction() {
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
