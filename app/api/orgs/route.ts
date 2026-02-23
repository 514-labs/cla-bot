import { NextResponse } from "next/server"
import { getOrganizations } from "@/lib/db/queries"
import { getSessionUser } from "@/lib/auth"
import { toSessionUserDto } from "@/lib/session-user"
import { filterInstalledOrganizationsForAdmin } from "@/lib/github/admin-authorization"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const allOrgs = await getOrganizations()
    const orgs = await filterInstalledOrganizationsForAdmin(user, allOrgs)
    return NextResponse.json({ orgs, user: toSessionUserDto(user) })
  } catch (err) {
    console.error("Failed to list authorized organizations:", err)
    return NextResponse.json(
      { error: "Failed to verify GitHub organization admin access" },
      { status: 502 }
    )
  }
}
