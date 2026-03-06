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

function getGitHubAccessToken(user: UserWithToken): string | null {
  const encryptedToken = user.githubAccessTokenEncrypted ?? null
  if (!encryptedToken) return null
  return decryptSecret(encryptedToken)
}

function createUserOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken })
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

  const octokit = createUserOctokit(accessToken)

  try {
    const { data: membership } = await octokit.rest.orgs.getMembershipForAuthenticatedUser({
      org: orgSlug,
    })
    return membership.state === "active" && membership.role === "admin"
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status: number }).status
      if (status === 404 || status === 403) return false
    }
    throw error
  }
}

/**
 * Fetches all GitHub org slugs where the authenticated user has an active admin role.
 * Handles pagination via Link headers.
 */
async function getUserAdminOrgSlugs(accessToken: string): Promise<Set<string>> {
  const octokit = createUserOctokit(accessToken)
  const memberships = await octokit.paginate(
    octokit.rest.orgs.listMembershipsForAuthenticatedUser,
    { state: "active", per_page: 100 }
  )

  const slugs = new Set<string>()
  for (const m of memberships) {
    if (m.role === "admin" && m.organization?.login) {
      slugs.add(m.organization.login.toLowerCase())
    }
  }
  return slugs
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
 * Returns installed org rows the current user is allowed to administer.
 *
 * Production: requires an OAuth token and validates admin role against GitHub
 * for organization installs. Personal-account installs are authorized by
 * matching the signed-in user identity with the installation target account.
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

  const userAccountChecks = userAccountInstalls.map((org) => ({
    org,
    isAdmin: isPersonalAccountOwner(user, org),
    error: null as string | null,
    checkType: "personal_account_owner",
  }))

  const hasGitHubToken = Boolean(getGitHubAccessToken(user))
  if (!hasGitHubToken) {
    console.warn("[admin-auth] Missing GitHub OAuth token for org-admin checks", {
      userId: user.id,
      nodeEnv: process.env.NODE_ENV,
    })

    const fallbackOrgChecks =
      process.env.NODE_ENV !== "production"
        ? orgAccountInstalls.map((org) => ({
            org,
            isAdmin: org.adminUserId === user.id,
            error: null as string | null,
            checkType: "db_fallback",
          }))
        : orgAccountInstalls.map((org) => ({
            org,
            isAdmin: false,
            error: null as string | null,
            checkType: "missing_token",
          }))

    const combinedChecks = [...userAccountChecks, ...fallbackOrgChecks]
    console.info("[admin-auth] Account-admin check results", {
      userId: user.id,
      checks: combinedChecks.map((result) => ({
        orgSlug: result.org.githubOrgSlug,
        accountType: normalizeAccountType(result.org),
        accountId: result.org.githubAccountId ?? null,
        installationId: result.org.installationId,
        isAdmin: result.isAdmin,
        checkType: result.checkType,
      })),
    })

    const authorizedOrgs = combinedChecks
      .filter((result) => result.isAdmin)
      .map((result) => result.org)
    console.info("[admin-auth] Authorized orgs after checks", {
      userId: user.id,
      authorizedCount: authorizedOrgs.length,
      authorizedOrgs: summarizeOrgs(authorizedOrgs),
    })
    return authorizedOrgs
  }

  let orgCheckResults: {
    org: T
    isAdmin: boolean
    error: string | null
    checkType: string
  }[]

  try {
    // Token presence is guaranteed by the hasGitHubToken guard above
    const accessToken = getGitHubAccessToken(user) as string
    const adminOrgSlugs = await getUserAdminOrgSlugs(accessToken)
    orgCheckResults = orgAccountInstalls.map((org) => ({
      org,
      isAdmin: adminOrgSlugs.has(org.githubOrgSlug.toLowerCase()),
      error: null,
      checkType: "github_org_membership",
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    orgCheckResults = orgAccountInstalls.map((org) => ({
      org,
      isAdmin: false,
      error: message,
      checkType: "github_org_membership",
    }))
  }

  const results = [...userAccountChecks, ...orgCheckResults]
  console.info("[admin-auth] Account-admin check results", {
    userId: user.id,
    checks: results.map((result) => ({
      orgSlug: result.org.githubOrgSlug,
      accountType: normalizeAccountType(result.org),
      accountId: result.org.githubAccountId ?? null,
      installationId: result.org.installationId,
      isAdmin: result.isAdmin,
      error: result.error,
      checkType: result.checkType,
    })),
  })

  const failedChecks = orgCheckResults.filter((result) => result.error !== null)
  if (failedChecks.length > 0) {
    console.warn("[admin-auth] GitHub org-admin checks failed for some orgs", {
      userId: user.id,
      failed: failedChecks.map((result) => ({
        orgSlug: result.org.githubOrgSlug,
        error: result.error,
      })),
    })
  }

  const authorizedOrgs = results.filter((result) => result.isAdmin).map((result) => result.org)
  console.info("[admin-auth] Authorized orgs after checks", {
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
