import { Octokit } from "@octokit/rest"
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

const ORG_LOG_LIMIT = 25

function getUserOctokit(user: UserWithToken): Octokit | null {
  const encrypted = user.githubAccessTokenEncrypted ?? null
  if (!encrypted) return null
  const token = decryptSecret(encrypted)
  if (!token) return null
  return new Octokit({ auth: token })
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
  const octokit = getUserOctokit(user)
  if (!octokit) return false

  try {
    const { data } = await octokit.orgs.getMembershipForAuthenticatedUser({ org: orgSlug })
    return data.state === "active" && data.role === "admin"
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status
      if (status === 404 || status === 403) return false
    }
    throw err
  }
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
 * Fetch all orgs where the authenticated user is an active admin.
 * Uses Octokit pagination to handle large membership lists.
 */
async function getAdminOrgIds(octokit: Octokit): Promise<Set<string>> {
  const memberships = await octokit.paginate(octokit.orgs.listMembershipsForAuthenticatedUser, {
    state: "active",
    per_page: 100,
  })

  const ids = new Set<string>()
  for (const m of memberships) {
    if (m.role !== "admin") continue
    ids.add(String(m.organization.id))
    ids.add(m.organization.login.toLowerCase())
  }
  return ids
}

/**
 * Returns installed org rows the current user is allowed to administer.
 *
 * Organization installs: fetches the user's active admin memberships from
 * GitHub in a single paginated call, then intersects with DB rows.
 * Personal-account installs: matches signed-in user identity.
 * Dev/test fallback: if no OAuth token, org installs fall back to DB admin mapping.
 */
export async function filterInstalledOrganizationsForAdmin<T extends InstalledOrganization>(
  user: UserWithToken,
  orgs: T[]
): Promise<T[]> {
  const installedOrgs = orgs.filter((org) => org.installationId !== null)
  if (installedOrgs.length === 0) return []

  const personalAccounts = installedOrgs
    .filter((org) => normalizeAccountType(org) === "user")
    .filter((org) => isPersonalAccountOwner(user, org))

  const orgAccounts = installedOrgs.filter((org) => normalizeAccountType(org) === "organization")
  let adminOrgs: T[] = []

  const octokit = getUserOctokit(user)
  if (!octokit) {
    if (process.env.NODE_ENV !== "production") {
      adminOrgs = orgAccounts.filter((org) => org.adminUserId === user.id)
    }
  } else if (orgAccounts.length > 0) {
    const adminIds = await getAdminOrgIds(octokit)
    adminOrgs = orgAccounts.filter(
      (org) =>
        (org.githubAccountId && adminIds.has(String(org.githubAccountId))) ||
        adminIds.has(org.githubOrgSlug.toLowerCase())
    )
  }

  const authorized = [...personalAccounts, ...adminOrgs]
  console.info("[admin-auth] Authorized orgs", {
    userId: user.id,
    count: authorized.length,
    orgs: summarizeOrgs(authorized),
  })
  return authorized
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
