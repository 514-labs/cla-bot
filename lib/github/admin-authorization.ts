import { Octokit } from "@octokit/rest"
import { getValidUserAccessToken } from "@/lib/github/user-token"
import { getGitHubApiBaseUrl } from "@/lib/github/base-urls"
import { accountIdMatches, normalizeAccountId } from "@/lib/github/org-identity"

type UserWithToken = {
  id: string
  role?: string
  githubId?: string
  githubUsername?: string
}

type InstalledOrganization = {
  adminUserId: string
  githubOrgSlug: string
  installationId: number | null
  githubAccountType?: string | null
  githubAccountId?: string | null
}

const ORG_LOG_LIMIT = 25

async function getGitHubAccessToken(user: UserWithToken): Promise<string | null> {
  return getValidUserAccessToken(user.id)
}

function createOctokitClientWithUserIdentity(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken, baseUrl: getGitHubApiBaseUrl() })
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

async function hasActiveOrgAdminMembership(octokit: Octokit, orgSlug: string): Promise<boolean> {
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
 * Resolve the GitHub account id currently behind an org login. Logins are
 * mutable and reusable, so this is what a stored row must be compared against.
 */
async function getLiveOrgAccountId(octokit: Octokit, orgSlug: string): Promise<string | null> {
  const { data } = await octokit.rest.orgs.get({ org: orgSlug })
  return normalizeAccountId(data?.id)
}

/**
 * Returns true when the user is an active org admin/owner on GitHub.
 */
export async function isGitHubOrgAdmin(user: UserWithToken, orgSlug: string): Promise<boolean> {
  const accessToken = await getGitHubAccessToken(user)
  if (!accessToken) return false

  const octokit = createOctokitClientWithUserIdentity(accessToken)
  return hasActiveOrgAdminMembership(octokit, orgSlug)
}

/**
 * Fetches the GitHub orgs where the authenticated user has an active admin
 * role, keyed by lower-cased login and carrying the org's account id.
 * Handles pagination via Link headers.
 */
async function getUserAdminOrgs(accessToken: string): Promise<Map<string, string | null>> {
  const octokit = createOctokitClientWithUserIdentity(accessToken)
  const memberships = await octokit.paginate(
    octokit.rest.orgs.listMembershipsForAuthenticatedUser,
    { state: "active", per_page: 100 }
  )

  const orgs = new Map<string, string | null>()
  for (const m of memberships) {
    if (m.role === "admin" && m.organization?.login) {
      orgs.set(m.organization.login.toLowerCase(), normalizeAccountId(m.organization.id))
    }
  }
  return orgs
}

export type InstallationAdminVerification = {
  isAdmin: boolean
  /**
   * The GitHub account id the check confirmed for the installation target, or
   * null when the check did not establish one. When the stored row has no
   * account id yet, callers may persist this value (legacy backfill).
   */
  verifiedAccountId: string | null
}

function logIdentityMismatch(
  user: UserWithToken,
  org: InstalledOrganization,
  liveAccountId: string | null
) {
  console.warn("[admin-auth] GitHub account identity mismatch for installed org", {
    userId: user.id,
    orgSlug: org.githubOrgSlug,
    storedAccountId: org.githubAccountId ?? null,
    liveAccountId,
  })
}

/**
 * Verify that the user can administer this installed GitHub account and that
 * the account behind the stored slug is still the account the row was created
 * for.
 * - Organization install: requires active org admin membership on GitHub AND
 *   the live org id to equal the stored `githubAccountId` (a null stored id is
 *   a legacy row and is accepted so it can be backfilled).
 * - Personal account install: requires the authenticated user to be the
 *   account owner.
 * Fails closed on an identity mismatch: a freshly registered org that reuses
 * a renamed org's login must never unlock the old org's records.
 */
export async function verifyGitHubInstallationAccountAdmin(
  user: UserWithToken,
  org: InstalledOrganization
): Promise<InstallationAdminVerification> {
  if (normalizeAccountType(org) === "user") {
    const isOwner = isPersonalAccountOwner(user, org)
    return {
      isAdmin: isOwner,
      verifiedAccountId: isOwner ? normalizeAccountId(user.githubId) : null,
    }
  }

  const accessToken = await getGitHubAccessToken(user)
  if (!accessToken) return { isAdmin: false, verifiedAccountId: null }

  const octokit = createOctokitClientWithUserIdentity(accessToken)
  const isAdmin = await hasActiveOrgAdminMembership(octokit, org.githubOrgSlug)
  if (!isAdmin) return { isAdmin: false, verifiedAccountId: null }

  const liveAccountId = await getLiveOrgAccountId(octokit, org.githubOrgSlug)
  if (!accountIdMatches(org.githubAccountId, liveAccountId)) {
    logIdentityMismatch(user, org, liveAccountId)
    return { isAdmin: false, verifiedAccountId: null }
  }

  return { isAdmin: true, verifiedAccountId: liveAccountId }
}

/**
 * Returns true when the user can administer this installed GitHub account.
 * See `verifyGitHubInstallationAccountAdmin` for the rules.
 */
export async function isGitHubInstallationAccountAdmin(
  user: UserWithToken,
  org: InstalledOrganization
): Promise<boolean> {
  const verification = await verifyGitHubInstallationAccountAdmin(user, org)
  return verification.isAdmin
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

  const accessToken = await getGitHubAccessToken(user)
  if (!accessToken) {
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
    // accessToken is non-null here — guarded by the early-return above.
    const adminOrgs = await getUserAdminOrgs(accessToken)
    orgCheckResults = orgAccountInstalls.map((org) => {
      const slug = org.githubOrgSlug.toLowerCase()
      if (!adminOrgs.has(slug)) {
        return { org, isAdmin: false, error: null, checkType: "github_org_membership" }
      }
      // Admin of an org with that login -- but is it the same org this row was
      // created for? A login freed by a rename can be re-registered by anyone.
      const liveAccountId = adminOrgs.get(slug) ?? null
      if (!accountIdMatches(org.githubAccountId, liveAccountId)) {
        logIdentityMismatch(user, org, liveAccountId)
        return { org, isAdmin: false, error: null, checkType: "github_org_identity_mismatch" }
      }
      return { org, isAdmin: true, error: null, checkType: "github_org_membership" }
    })
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
