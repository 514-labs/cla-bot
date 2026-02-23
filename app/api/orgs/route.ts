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
    console.info("[api/orgs] Listing organizations for user", {
      userId: user.id,
      githubUsername: user.githubUsername,
    })
    const allOrgs = await getOrganizations()
    const installedOrgs = allOrgs.filter((org) => org.installationId !== null)
    console.info("[api/orgs] Retrieved organizations from DB", {
      userId: user.id,
      totalOrgs: allOrgs.length,
      installedCount: installedOrgs.length,
      installedOrgSlugs: installedOrgs.map((org) => org.githubOrgSlug),
    })

    const orgs = await filterInstalledOrganizationsForAdmin(user, allOrgs)
    console.info("[api/orgs] Authorized organizations resolved", {
      userId: user.id,
      authorizedCount: orgs.length,
      authorizedOrgSlugs: orgs.map((org) => org.githubOrgSlug),
    })
    return NextResponse.json({
      orgs,
      user: toSessionUserDto(user),
      installedOrgsCount: installedOrgs.length,
    })
  } catch (err) {
    console.error("Failed to list authorized organizations:", err)
    return NextResponse.json(
      { error: "Failed to verify GitHub organization admin access" },
      { status: 502 }
    )
  }
}
