import { decryptSecret } from "@/lib/security/encryption"

type UserWithToken = {
  id: string
  role?: string
  githubAccessTokenEncrypted?: string | null
}

type InstalledOrganization = {
  adminUserId: string
  githubOrgSlug: string
  installationId: number | null
}

type OrgMembershipResponse = {
  state?: string
  role?: string
}

const ORG_LOG_LIMIT = 25

function getGitHubAccessToken(user: UserWithToken): string | null {
  const encryptedToken = user.githubAccessTokenEncrypted ?? null
  if (!encryptedToken) return null
  return decryptSecret(encryptedToken)
}

/**
 * Returns true when the user is an active org admin/owner on GitHub.
 */
export async function isGitHubOrgAdmin(user: UserWithToken, orgSlug: string): Promise<boolean> {
  const accessToken = getGitHubAccessToken(user)
  if (!accessToken) return false

  const membershipRes = await fetch(`https://api.github.com/user/memberships/orgs/${orgSlug}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })

  if (membershipRes.status === 404) return false
  if (!membershipRes.ok) {
    throw new Error(`Failed GitHub org membership check: ${membershipRes.status}`)
  }

  const membership = (await membershipRes.json()) as OrgMembershipResponse
  return membership.state === "active" && membership.role === "admin"
}

/**
 * Returns installed org rows the current user is allowed to administer.
 *
 * Production: requires an OAuth token and validates admin role against GitHub.
 * Dev/test fallback: if no OAuth token exists, falls back to the DB admin mapping.
 */
export async function filterInstalledOrganizationsForAdmin<T extends InstalledOrganization>(
  user: UserWithToken,
  orgs: T[]
): Promise<T[]> {
  const installedOrgs = orgs.filter((org) => org.installationId !== null)
  console.info("[admin-auth] Installed org candidates", {
    userId: user.id,
    count: installedOrgs.length,
    orgSlugs: summarizeOrgSlugs(installedOrgs),
  })
  if (installedOrgs.length === 0) return []

  const hasGitHubToken = Boolean(getGitHubAccessToken(user))
  if (!hasGitHubToken) {
    console.warn("[admin-auth] Missing GitHub OAuth token for org-admin checks", {
      userId: user.id,
      nodeEnv: process.env.NODE_ENV,
    })
    if (process.env.NODE_ENV !== "production") {
      const fallbackOrgs = installedOrgs.filter((org) => org.adminUserId === user.id)
      console.info("[admin-auth] Non-production DB fallback applied", {
        userId: user.id,
        authorizedCount: fallbackOrgs.length,
        authorizedOrgSlugs: summarizeOrgSlugs(fallbackOrgs),
      })
      return fallbackOrgs
    }
    return []
  }

  const checks = await Promise.allSettled(
    installedOrgs.map((org) => isGitHubOrgAdmin(user, org.githubOrgSlug))
  )

  const results = checks.map((check, index) => {
    const org = installedOrgs[index]
    if (check.status === "fulfilled") {
      return {
        org,
        isAdmin: check.value,
        error: null as string | null,
      }
    }

    const message = check.reason instanceof Error ? check.reason.message : String(check.reason)
    return {
      org,
      isAdmin: false,
      error: message,
    }
  })

  console.info("[admin-auth] GitHub org-admin check results", {
    userId: user.id,
    checks: results.map((result) => ({
      orgSlug: result.org.githubOrgSlug,
      installationId: result.org.installationId,
      isAdmin: result.isAdmin,
      error: result.error,
    })),
  })

  const failedChecks = results.filter((result) => result.error !== null)
  if (failedChecks.length > 0) {
    const failedOrgSlugs = failedChecks.map((result) => result.org.githubOrgSlug)
    throw new Error(
      `GitHub org-admin checks failed for ${failedChecks.length} org(s): ${failedOrgSlugs.join(", ")}`
    )
  }

  const authorizedOrgs = results.filter((result) => result.isAdmin).map((result) => result.org)
  console.info("[admin-auth] Authorized orgs after checks", {
    userId: user.id,
    authorizedCount: authorizedOrgs.length,
    authorizedOrgSlugs: summarizeOrgSlugs(authorizedOrgs),
  })
  return authorizedOrgs
}

function summarizeOrgSlugs<T extends InstalledOrganization>(orgs: T[]) {
  const slugs = orgs.map((org) => org.githubOrgSlug)
  if (slugs.length <= ORG_LOG_LIMIT) return slugs
  return [...slugs.slice(0, ORG_LOG_LIMIT), `...(+${slugs.length - ORG_LOG_LIMIT} more)`]
}
