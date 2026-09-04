/**
 * Organization identity reconciliation.
 *
 * Organization rows are keyed by GitHub login slug, but a slug is mutable and
 * reusable: an account can rename itself and a stranger can then register the
 * freed login. The immutable identity of an installation target is its GitHub
 * account id. This module decides whether a row that was found through a
 * *mutable* key (installation id, previous slug, current slug) may be treated
 * as the account a webhook payload is talking about.
 *
 * Kept free of database and framework imports so the decision is unit-testable
 * in isolation; the webhook route wires in the real lookups.
 */

export type OrganizationIdentityRow = {
  id: string
  githubOrgSlug: string
  githubAccountId: string | null
  installationId: number | null
}

export type OrganizationMatchSource =
  | "account_id"
  | "installation_id"
  | "previous_slug"
  | "current_slug"

export type OrganizationIdentityResolution<T extends OrganizationIdentityRow> =
  | {
      status: "matched"
      org: T
      matchedBy: OrganizationMatchSource
      /** True when the row has no stored account id and the payload supplies one. */
      needsAccountIdBackfill: boolean
    }
  | {
      /**
       * A row was found through a mutable key, but it belongs to a different
       * GitHub account than the payload. It must not be reused or rebound.
       */
      status: "conflict"
      org: T
      matchedBy: Exclude<OrganizationMatchSource, "account_id">
      payloadAccountId: string
    }
  | { status: "none" }

export type OrganizationIdentityLookups<T extends OrganizationIdentityRow> = {
  byAccountId: (accountId: string) => Promise<T | undefined>
  byInstallationId: (installationId: number) => Promise<T | undefined>
  bySlug: (slug: string) => Promise<T | undefined>
}

export type OrganizationIdentityParams = {
  accountId?: number | string | null
  installationId?: number | null
  previousSlug?: string | null
  currentSlug?: string | null
}

export function normalizeAccountId(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

/**
 * Whether a stored account id is compatible with a live one. A null stored id
 * is a legacy row created before account ids were recorded and is accepted so
 * it can be backfilled; a non-null stored id must match exactly.
 */
export function accountIdMatches(
  stored: string | null | undefined,
  live: number | string | null | undefined
): boolean {
  const normalizedStored = normalizeAccountId(stored)
  if (normalizedStored === null) return true
  const normalizedLive = normalizeAccountId(live)
  return normalizedLive !== null && normalizedLive === normalizedStored
}

/**
 * Resolve the organization row a webhook payload refers to.
 *
 * Lookup order: account id, installation id, previous slug, current slug. Any
 * match found by something other than the account id is only accepted when
 * the payload carries no account id (nothing to verify against), the row has
 * no stored account id yet (legacy backfill), or the two ids agree. Otherwise
 * the match is reported as a conflict so the caller can quarantine the stale
 * row instead of handing it to a different account.
 */
export async function resolveOrganizationIdentity<T extends OrganizationIdentityRow>(
  params: OrganizationIdentityParams,
  lookups: OrganizationIdentityLookups<T>
): Promise<OrganizationIdentityResolution<T>> {
  const payloadAccountId = normalizeAccountId(params.accountId)

  if (payloadAccountId) {
    const byAccountId = await lookups.byAccountId(payloadAccountId)
    if (byAccountId) {
      return {
        status: "matched",
        org: byAccountId,
        matchedBy: "account_id",
        needsAccountIdBackfill: false,
      }
    }
  }

  const candidates: Array<{
    matchedBy: Exclude<OrganizationMatchSource, "account_id">
    lookup: () => Promise<T | undefined>
  }> = []
  if (params.installationId) {
    const installationId = params.installationId
    candidates.push({
      matchedBy: "installation_id",
      lookup: () => lookups.byInstallationId(installationId),
    })
  }
  if (params.previousSlug) {
    const previousSlug = params.previousSlug
    candidates.push({ matchedBy: "previous_slug", lookup: () => lookups.bySlug(previousSlug) })
  }
  if (params.currentSlug) {
    const currentSlug = params.currentSlug
    candidates.push({ matchedBy: "current_slug", lookup: () => lookups.bySlug(currentSlug) })
  }

  for (const candidate of candidates) {
    const org = await candidate.lookup()
    if (!org) continue

    if (payloadAccountId && !accountIdMatches(org.githubAccountId, payloadAccountId)) {
      return { status: "conflict", org, matchedBy: candidate.matchedBy, payloadAccountId }
    }

    return {
      status: "matched",
      org,
      matchedBy: candidate.matchedBy,
      needsAccountIdBackfill: payloadAccountId !== null && org.githubAccountId === null,
    }
  }

  return { status: "none" }
}

export const ORPHANED_SLUG_MARKER = "__orphaned-"

/**
 * Deterministic slug for a row that has been detached from a login it no
 * longer owns on GitHub. Frees the login for the account that holds it now
 * while keeping the stale row (and its signatures) recoverable by account id.
 */
export function buildOrphanedOrganizationSlug(
  slug: string,
  storedAccountId: string | null | undefined
): string {
  const suffix = normalizeAccountId(storedAccountId) ?? "unknown"
  return `${slug}${ORPHANED_SLUG_MARKER}${suffix}`
}
