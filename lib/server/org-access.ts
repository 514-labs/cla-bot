import { getSessionUser } from "@/lib/auth"
import { backfillOrganizationGithubAccountId, getOrganizationBySlug } from "@/lib/db/queries"
import { verifyGitHubInstallationAccountAdmin } from "@/lib/github/admin-authorization"

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

export type OrgAccessResult = OrgAccessSuccess | OrgAccessFailure

export async function authorizeOrgAccess(orgSlug: string): Promise<OrgAccessResult> {
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return {
      ok: false,
      status: 404,
      message: "Organization not found",
    }
  }

  // A row without an installation is a stale record (uninstalled, suspended or
  // quarantined after an identity conflict). The admin surface only manages
  // live installations -- the same rule `filterInstalledOrganizationsForAdmin`
  // applies to the list -- so a stale row is not reachable by its slug at all.
  if (org.installationId === null) {
    return {
      ok: false,
      status: 404,
      message: "Organization is not installed",
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

  let verifiedAccountId: string | null = null
  try {
    const verification = await verifyGitHubInstallationAccountAdmin(user, org)
    verifiedAccountId = verification.verifiedAccountId
    if (!verification.isAdmin) {
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

  // Legacy rows predate account ids. Once GitHub has confirmed which account
  // is behind the slug for an authorized admin, pin it so future checks (and
  // webhook reconciliation) compare identities rather than names.
  if (org.githubAccountId === null && verifiedAccountId) {
    try {
      const updated = await backfillOrganizationGithubAccountId(org.id, verifiedAccountId)
      if (updated) return { ok: true, org: updated, user }
    } catch (error) {
      console.error("Failed to backfill organization GitHub account id:", error)
    }
  }

  return { ok: true, org, user }
}
