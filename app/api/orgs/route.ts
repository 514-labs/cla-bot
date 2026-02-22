import { NextResponse } from "next/server"
import { getSessionUser, getOrganizationsByAdmin } from "@/lib/db/queries"

export async function GET() {
  const user = getSessionUser()
  const orgs = await getOrganizationsByAdmin(user.id)
  return NextResponse.json({ orgs, user })
}
