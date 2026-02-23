import { NextResponse } from "next/server"
import { getOrganizationsByAdmin } from "@/lib/db/queries"
import { getSessionUser } from "@/lib/auth"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgs = await getOrganizationsByAdmin(user.id)
  return NextResponse.json({ orgs, user })
}
