import { decryptSecret } from "@/lib/security/encryption"

type UserWithToken = {
  id: string
  role?: string
  githubId?: string
  githubUsername?: string
  githubAccessTokenEncrypted?: string | null
}

type InstalledOrganization = {
  adminUserId: string
  githubOrgSlug: string
  installationId: number | null
  githubAccountType?: string | null
  githubAccountId?: string | null
}

type OrgMembershipResponse = {
  state?: string
  role?: string
}

type OrgMembershipListItem = {
  state: string
  role: string
  organization: {
    id: number
    login: string
  }
}

const ORG_LOG_LIMIT = 25

function getGitHubAccessToken(user: UserWithToken): string | null {
  const encryptedToken = user.githubAccessTokenEncrypted ?? null
  if (!encryptedToken) return null
  return decryptSecret(encryptedToken)
}

function normalizeAccountType(org: InstalledOrganization): "organization" | "user" {
  return org.githubAccountType === "user" ? "user" : "organization"
}

function isPersonalAccountOwner(user: UserWithToken, org: InstalledOrganization): boolean {
  if (normalizeAccountType(org) !== "user") return false

  const normalizedAccountId = org.githubAccountId ? String(org.githubAccountId) : null
  const normalizedUserId = user.githubId ? String(user.githubId) : null
  if (normalizedAccountId && normalizedUserId) {
    return normalizedAccountId === normalizedUserId
  }

  if (!user.githubUsername) return false
  return user.githubUsername.toLowerCase() === org.githubOrgSlug.toLowerCase()
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

  if (membershipRes.status === 404 || membershipRes.status === 403) return false
  if (!membershipRes.ok) {
    throw new Error(`Failed GitHub org membership check: ${membershipRes.status}`)
  }

  const membership = (await membershipRes.json()) as OrgMembershipResponse
  return membership.state === "active" && membership.role === "admin"
}

/**
 * Returns true when the user can administer this installed GitHub account.
 * - Organization install: requires active org admin membership.
 * - Personal account install: requires the authenticated user to be the account owner.
 */
export async function isGitHubInstallationAccountAdmin(
  user: UserWithToken,
  org: InstalledOrganization
): Promise<boolean> {
  if (normalizeAccountType(org) === "user") {
    return isPersonalAccountOwner(user, org)
  }
  return isGitHubOrgAdmin(user, org.githubOrgSlug)
}

/**
 * Fetch all organizations where the user has an active admin role.
 * Uses the GitHub list-org-memberships endpoint with state=active&role=admin,
 * paginating through all results.
 */
async function getAdminOrgMemberships(
  accessToken: string
): Promise<{ id: string; login: string }[]> {
  const adminOrgs: { id: string; login: string }[] = []
  let url: string | null =
    "https://api.github.com/user/memberships/orgs?state=active&role=admin&per_page=100"

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      throw new Error(`Failed to list GitHub org memberships: ${res.status}`)
    }

    const items = (await res.json()) as OrgMembershipListItem[]
    for (const item of items) {
      adminOrgs.push({
        id: String(item.organization.id),
        login: item.organization.login.toLowerCase(),
      })
    }

    // Follow pagination via Link header
    const linkHeader = res.headers.get("link")
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return adminOrgs
}

/**
 * Returns installed org rows the current user is allowed to administer.
 *
 * Production: fetches the user's active admin org memberships from GitHub in a
 * single paginated call, then intersects with DB org rows. Personal-account
 * installs are authorized by matching the signed-in user identity.
 * Dev/test fallback: if no OAuth token exists, organization installs fall back
 * to the DB admin mapping.
 */
export async function filterInstalledOrganizationsForAdmin<T extends InstalledOrganization>(
  user: UserWithToken,
  orgs: T[]
): Promise<T[]> {
  const installedOrgs = orgs.filter((org) => org.installationId !== null)
  console.info("[admin-auth] Installed org candidates", {
    userId: user.id,
    count: installedOrgs.length,
    orgs: summarizeOrgs(installedOrgs),
  })
  if (installedOrgs.length === 0) return []

  const userAccountInstalls = installedOrgs.filter((org) => normalizeAccountType(org) === "user")
  const orgAccountInstalls = installedOrgs.filter(
    (org) => normalizeAccountType(org) === "organization"
  )

  // Personal-account installs: check ownership by identity match
  const ownedPersonalAccounts = userAccountInstalls.filter((org) =>
    isPersonalAccountOwner(user, org)
  )

  // Organization installs: check admin role via GitHub API
  const accessToken = getGitHubAccessToken(user)
  let adminOrgAccounts: T[] = []

  if (!accessToken) {
    console.warn("[admin-auth] Missing GitHub OAuth token for org-admin checks", {
      userId: user.id,
      nodeEnv: process.env.NODE_ENV,
    })

    if (process.env.NODE_ENV !== "production") {
      adminOrgAccounts = orgAccountInstalls.filter((org) => org.adminUserId === user.id)
      console.info("[admin-auth] Using DB admin fallback", {
        userId: user.id,
        matchedCount: adminOrgAccounts.length,
      })
    }
  } else if (orgAccountInstalls.length > 0) {
    const adminMemberships = await getAdminOrgMemberships(accessToken)
    const adminIdSet = new Set(adminMemberships.map((m) => m.id))
    const adminLoginSet = new Set(adminMemberships.map((m) => m.login))

    console.info("[admin-auth] GitHub admin org memberships", {
      userId: user.id,
      count: adminMemberships.length,
      orgs: adminMemberships.slice(0, ORG_LOG_LIMIT).map((m) => m.login),
    })

    adminOrgAccounts = orgAccountInstalls.filter((org) => {
      if (org.githubAccountId && adminIdSet.has(String(org.githubAccountId))) return true
      return adminLoginSet.has(org.githubOrgSlug.toLowerCase())
    })
  }

  const authorizedOrgs = [...ownedPersonalAccounts, ...adminOrgAccounts]
  console.info("[admin-auth] Authorized orgs", {
    userId: user.id,
    authorizedCount: authorizedOrgs.length,
    authorizedOrgs: summarizeOrgs(authorizedOrgs),
  })
  return authorizedOrgs
}

function summarizeOrgs<T extends InstalledOrganization>(orgs: T[]) {
  const summary = orgs.map((org) => ({
    slug: org.githubOrgSlug,
    accountType: normalizeAccountType(org),
    accountId: org.githubAccountId ?? null,
  }))
  if (summary.length <= ORG_LOG_LIMIT) return summary
  return [
    ...summary.slice(0, ORG_LOG_LIMIT),
    { slug: `...(+${summary.length - ORG_LOG_LIMIT} more)` },
  ]
}
