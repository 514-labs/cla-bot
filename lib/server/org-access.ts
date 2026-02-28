import { getSessionUser } from "@/lib/auth"
import { getOrganizationBySlug } from "@/lib/db/queries"
import { isGitHubInstallationAccountAdmin } from "@/lib/github/admin-authorization"

type OrgAccessSuccess = {
  ok: true
  org: NonNullable<Awaited<ReturnType<typeof getOrganizationBySlug>>>
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>
}

type OrgAccessFailure = {
  ok: false
  status: 401 | 403 | 404 | 502
  message: string
}

type OrgAccessResult = OrgAccessSuccess | OrgAccessFailure

export async function authorizeOrgAccess(orgSlug: string): Promise<OrgAccessResult> {
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return {
      ok: false,
      status: 404,
      message: "Organization not found",
    }
  }

  const user = await getSessionUser()
  if (!user) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized",
    }
  }

  try {
    const isAdmin = await isGitHubInstallationAccountAdmin(user, org)
    if (!isAdmin) {
      // In non-production, when no GitHub OAuth token is available for org-admin
      // checks, fall back to the DB admin mapping — consistent with
      // filterInstalledOrganizationsForAdmin. This is strictly scoped: only the
      // designated admin (who installed the app) passes, not any authenticated user.
      const hasDbAdminFallback =
        process.env.NODE_ENV !== "production" && org.adminUserId === user.id
      if (!hasDbAdminFallback) {
        return {
          ok: false,
          status: 403,
          message: "Forbidden: GitHub installation admin access required",
        }
      }
    }
  } catch (error) {
    console.error("GitHub installation-admin verification failed:", error)
    return {
      ok: false,
      status: 502,
      message: "Failed to verify GitHub installation admin access",
    }
  }

  return { ok: true, org, user }
}
