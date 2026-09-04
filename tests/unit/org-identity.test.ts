import { describe, expect, it, vi } from "vitest"

import {
  accountIdMatches,
  buildOrphanedOrganizationSlug,
  type OrganizationIdentityLookups,
  type OrganizationIdentityRow,
  resolveOrganizationIdentity,
} from "@/lib/github/org-identity"

type Row = OrganizationIdentityRow

const victimRow: Row = {
  id: "org_victim",
  githubOrgSlug: "alice",
  githubAccountId: "1001",
  installationId: null,
}

const legacyRow: Row = {
  id: "org_legacy",
  githubOrgSlug: "acme",
  githubAccountId: null,
  installationId: 500,
}

function makeLookups(rows: Row[]): OrganizationIdentityLookups<Row> & {
  byAccountId: ReturnType<typeof vi.fn>
  byInstallationId: ReturnType<typeof vi.fn>
  bySlug: ReturnType<typeof vi.fn>
} {
  return {
    byAccountId: vi.fn(async (accountId: string) =>
      rows.find((row) => row.githubAccountId === accountId)
    ),
    byInstallationId: vi.fn(async (installationId: number) =>
      rows.find((row) => row.installationId === installationId)
    ),
    bySlug: vi.fn(async (slug: string) => rows.find((row) => row.githubOrgSlug === slug)),
  }
}

describe("accountIdMatches", () => {
  it("accepts a legacy row with no stored account id", () => {
    expect(accountIdMatches(null, 42)).toBe(true)
    expect(accountIdMatches(undefined, "42")).toBe(true)
    expect(accountIdMatches(null, null)).toBe(true)
  })

  it("requires an exact match when a stored account id exists", () => {
    expect(accountIdMatches("42", 42)).toBe(true)
    expect(accountIdMatches("42", "42")).toBe(true)
    expect(accountIdMatches("42", 43)).toBe(false)
    expect(accountIdMatches("42", null)).toBe(false)
    expect(accountIdMatches("42", undefined)).toBe(false)
  })
})

describe("resolveOrganizationIdentity", () => {
  it("matches by account id first, regardless of slug", async () => {
    const lookups = makeLookups([victimRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 1001, installationId: 999, currentSlug: "alice-dev" },
      lookups
    )

    expect(result).toEqual({
      status: "matched",
      org: victimRow,
      matchedBy: "account_id",
      needsAccountIdBackfill: false,
    })
    expect(lookups.byInstallationId).not.toHaveBeenCalled()
    expect(lookups.bySlug).not.toHaveBeenCalled()
  })

  it("matches by installation id when the stored account id agrees", async () => {
    const row: Row = { ...victimRow, installationId: 777 }
    const lookups = makeLookups([row])
    // The account-id lookup misses (simulates an id stored in a different format).
    lookups.byAccountId.mockResolvedValue(undefined)

    const result = await resolveOrganizationIdentity(
      { accountId: 1001, installationId: 777, currentSlug: "alice" },
      lookups
    )

    expect(result).toMatchObject({ status: "matched", org: row, matchedBy: "installation_id" })
  })

  it("backfills a legacy row found by installation id", async () => {
    const lookups = makeLookups([legacyRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 2001, installationId: 500, currentSlug: "acme-renamed" },
      lookups
    )

    expect(result).toEqual({
      status: "matched",
      org: legacyRow,
      matchedBy: "installation_id",
      needsAccountIdBackfill: true,
    })
  })

  it("backfills a legacy row found by current slug", async () => {
    const lookups = makeLookups([legacyRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 2001, installationId: 600, currentSlug: "acme" },
      lookups
    )

    expect(result).toEqual({
      status: "matched",
      org: legacyRow,
      matchedBy: "current_slug",
      needsAccountIdBackfill: true,
    })
  })

  it("backfills a legacy row found by previous slug (rename)", async () => {
    const lookups = makeLookups([legacyRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 2001, previousSlug: "acme", currentSlug: "acme-new" },
      lookups
    )

    expect(result).toMatchObject({
      status: "matched",
      org: legacyRow,
      matchedBy: "previous_slug",
      needsAccountIdBackfill: true,
    })
  })

  it("falls through to the slug without verification when the payload has no account id", async () => {
    const lookups = makeLookups([victimRow])

    const result = await resolveOrganizationIdentity({ currentSlug: "alice" }, lookups)

    expect(result).toEqual({
      status: "matched",
      org: victimRow,
      matchedBy: "current_slug",
      needsAccountIdBackfill: false,
    })
    expect(lookups.byAccountId).not.toHaveBeenCalled()
  })

  it("reports a conflict when a re-registered login matches a row for another account", async () => {
    // Victim `alice` (id 1001) renamed to `alice-dev`; attacker (id 6666)
    // registered the freed `alice` login and installed the app.
    const lookups = makeLookups([victimRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 6666, installationId: 31337, currentSlug: "alice" },
      lookups
    )

    expect(result).toEqual({
      status: "conflict",
      org: victimRow,
      matchedBy: "current_slug",
      payloadAccountId: "6666",
    })
  })

  it("reports a conflict for a previous-slug match owned by another account", async () => {
    const lookups = makeLookups([victimRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 6666, previousSlug: "alice", currentSlug: "evil-corp" },
      lookups
    )

    expect(result).toEqual({
      status: "conflict",
      org: victimRow,
      matchedBy: "previous_slug",
      payloadAccountId: "6666",
    })
  })

  it("reports a conflict for an installation-id match owned by another account", async () => {
    const row: Row = { ...victimRow, installationId: 777 }
    const lookups = makeLookups([row])

    const result = await resolveOrganizationIdentity(
      { accountId: 6666, installationId: 777, currentSlug: "someone" },
      lookups
    )

    expect(result).toMatchObject({ status: "conflict", org: row, matchedBy: "installation_id" })
  })

  it("returns none when nothing matches", async () => {
    const lookups = makeLookups([victimRow])

    const result = await resolveOrganizationIdentity(
      { accountId: 6666, installationId: 1, previousSlug: "x", currentSlug: "y" },
      lookups
    )

    expect(result).toEqual({ status: "none" })
  })
})

describe("buildOrphanedOrganizationSlug", () => {
  it("is deterministic per (slug, stored account id)", () => {
    expect(buildOrphanedOrganizationSlug("alice", "1001")).toBe("alice__orphaned-1001")
    expect(buildOrphanedOrganizationSlug("alice", "1001")).toBe(
      buildOrphanedOrganizationSlug("alice", "1001")
    )
  })

  it("falls back to a marker when the row has no account id", () => {
    expect(buildOrphanedOrganizationSlug("alice", null)).toBe("alice__orphaned-unknown")
  })
})
