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
  if (installedOrgs.length === 0) return []

  const hasGitHubToken = Boolean(getGitHubAccessToken(user))
  if (!hasGitHubToken) {
    if (process.env.NODE_ENV !== "production") {
      return installedOrgs.filter((org) => org.adminUserId === user.id)
    }
    return []
  }

  const checks = await Promise.all(
    installedOrgs.map(async (org) => ({
      org,
      isAdmin: await isGitHubOrgAdmin(user, org.githubOrgSlug),
    }))
  )

  return checks.filter((entry) => entry.isAdmin).map((entry) => entry.org)
}
