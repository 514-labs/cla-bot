/**
 * Database query layer.
 *
 * All functions use Drizzle ORM and hit the Neon Postgres database.
 * Session management lives in the auth layer.
 *
 * Data model:
 *  - organizations.claText + organizations.claTextSha256 = the live CLA
 *  - cla_archives = snapshot created lazily when someone signs a given sha256
 *  - cla_signatures.claSha256 = the sha256 the user signed
 *  - webhook_deliveries = persistent webhook delivery dedupe
 *  - audit_events = append-only audit trail
 */

import { and, desc, eq, sql } from "drizzle-orm"
import { ensureDbReady, resetDb } from "./index"
import {
  auditEvents,
  claArchives,
  orgClaBypassAccounts,
  claSignatures,
  organizations,
  users,
  webhookDeliveries,
} from "./schema"
import { sha256Hex } from "./sha256"

// ---------- Users ----------

export async function getUserById(id: string) {
  const db = await ensureDbReady()
  const rows = await db.select().from(users).where(eq(users.id, id))
  return rows[0] ?? undefined
}

export async function getUserByGithubId(githubId: string | number) {
  const db = await ensureDbReady()
  const normalizedGithubId = String(githubId)
  const rows = await db.select().from(users).where(eq(users.githubId, normalizedGithubId))
  return rows[0] ?? undefined
}

export async function getUserByUsername(username: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.githubUsername, username))
    .orderBy(desc(users.githubTokenUpdatedAt))
    .limit(1)
  return rows[0] ?? undefined
}

/**
 * Create or update a user from GitHub OAuth data.
 * Used during the OAuth callback to ensure the user exists in the DB.
 */
export async function upsertUser(data: {
  githubId: string | number
  githubUsername: string
  avatarUrl: string
  name: string
  email?: string
  emailVerified?: boolean
  emailSource?: string
  role?: "admin" | "contributor"
}) {
  const db = await ensureDbReady()
  const normalizedGithubId = String(data.githubId)

  // Immutable GitHub ID is the source of truth for identity.
  const existing = await getUserByGithubId(normalizedGithubId)
  if (existing) {
    const nextRole = data.role ?? existing.role
    const rows = await db
      .update(users)
      .set({
        githubUsername: data.githubUsername,
        avatarUrl: data.avatarUrl,
        name: data.name || existing.name,
        email: data.email ?? existing.email ?? "",
        emailVerified: data.emailVerified ?? existing.emailVerified,
        emailSource: data.emailSource ?? existing.emailSource,
        role: nextRole,
      })
      .where(eq(users.id, existing.id))
      .returning()
    return rows[0]
  }

  const existingByUsername = await getUserByUsername(data.githubUsername)
  if (existingByUsername) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `GitHub username collision for "${data.githubUsername}" with different githubId values`
      )
    }

    const rows = await db
      .update(users)
      .set({
        avatarUrl: data.avatarUrl,
        name: data.name || existingByUsername.name,
        email: data.email ?? existingByUsername.email ?? "",
        emailVerified: data.emailVerified ?? existingByUsername.emailVerified,
        emailSource: data.emailSource ?? existingByUsername.emailSource,
        role: data.role ?? existingByUsername.role,
      })
      .where(eq(users.id, existingByUsername.id))
      .returning()
    return rows[0]
  }

  const rows = await db
    .insert(users)
    .values({
      id: `user_${Date.now()}`,
      githubUsername: data.githubUsername,
      githubId: normalizedGithubId,
      email: data.email ?? "",
      emailVerified: data.emailVerified ?? false,
      emailSource: data.emailSource ?? "none",
      avatarUrl: data.avatarUrl,
      name: data.name || data.githubUsername,
      role: data.role ?? "contributor",
    })
    .returning()
  return rows[0]
}

/**
 * Store encrypted GitHub OAuth token metadata for a user.
 * Used for org-admin authorization checks against GitHub.
 */
export async function updateUserGithubAuth(
  userId: string,
  data: {
    accessTokenEncrypted: string
    tokenScopes?: string
  }
) {
  const db = await ensureDbReady()
  const rows = await db
    .update(users)
    .set({
      githubAccessTokenEncrypted: data.accessTokenEncrypted,
      githubTokenScopes: data.tokenScopes ?? null,
      githubTokenUpdatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .returning()
  return rows[0] ?? undefined
}

// ---------- Organizations ----------

export async function getOrganizations() {
  const db = await ensureDbReady()
  return db.select().from(organizations)
}

export async function getOrganizationsByAdmin(adminUserId: string) {
  const db = await ensureDbReady()
  return db.select().from(organizations).where(eq(organizations.adminUserId, adminUserId))
}

export async function getOrganizationBySlug(slug: string) {
  const db = await ensureDbReady()
  const rows = await db.select().from(organizations).where(eq(organizations.githubOrgSlug, slug))
  return rows[0] ?? undefined
}

export async function getOrganizationById(id: string) {
  const db = await ensureDbReady()
  const rows = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  return rows[0] ?? undefined
}

export async function getBypassAccountsByOrg(orgId: string) {
  const db = await ensureDbReady()
  return db
    .select()
    .from(orgClaBypassAccounts)
    .where(eq(orgClaBypassAccounts.orgId, orgId))
    .orderBy(orgClaBypassAccounts.githubUsername)
}

export async function getBypassAccountByOrgAndGithubId(orgId: string, githubUserId: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(orgClaBypassAccounts)
    .where(
      and(
        eq(orgClaBypassAccounts.orgId, orgId),
        eq(orgClaBypassAccounts.githubUserId, githubUserId)
      )
    )
    .limit(1)
  return rows[0] ?? undefined
}

export async function getBypassAccountByOrgAndGithubUsername(
  orgId: string,
  githubUsername: string
) {
  const db = await ensureDbReady()
  const normalizedUsername = githubUsername.trim().toLowerCase()
  if (!normalizedUsername) return undefined

  const rows = await db
    .select()
    .from(orgClaBypassAccounts)
    .where(
      and(
        eq(orgClaBypassAccounts.orgId, orgId),
        sql`lower(${orgClaBypassAccounts.githubUsername}) = ${normalizedUsername}`
      )
    )
    .limit(1)
  return rows[0] ?? undefined
}

export async function countBypassAccountsByOrg(orgId: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(orgClaBypassAccounts)
    .where(eq(orgClaBypassAccounts.orgId, orgId))
  return Number(rows[0]?.count ?? 0)
}

export async function addBypassAccount(data: {
  orgId: string
  githubUserId: string
  githubUsername: string
  createdByUserId: string
}) {
  const db = await ensureDbReady()
  const rows = await db
    .insert(orgClaBypassAccounts)
    .values({
      id: `bypass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgId: data.orgId,
      githubUserId: data.githubUserId,
      githubUsername: data.githubUsername,
      createdByUserId: data.createdByUserId,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing({
      target: [orgClaBypassAccounts.orgId, orgClaBypassAccounts.githubUserId],
    })
    .returning()

  return rows[0] ?? undefined
}

export async function removeBypassAccount(params: { orgId: string; githubUserId: string }) {
  const db = await ensureDbReady()
  const rows = await db
    .delete(orgClaBypassAccounts)
    .where(
      and(
        eq(orgClaBypassAccounts.orgId, params.orgId),
        eq(orgClaBypassAccounts.githubUserId, params.githubUserId)
      )
    )
    .returning()
  return rows[0] ?? undefined
}

export async function isBypassAccountForOrg(params: {
  orgId: string
  githubUserId?: string | number | null
  githubUsername?: string | null
}) {
  const normalizedGithubUserId =
    params.githubUserId === undefined || params.githubUserId === null
      ? null
      : String(params.githubUserId)
  if (normalizedGithubUserId) {
    const byId = await getBypassAccountByOrgAndGithubId(params.orgId, normalizedGithubUserId)
    if (byId) return byId
  }

  const normalizedGithubUsername =
    typeof params.githubUsername === "string" ? params.githubUsername.trim() : ""
  if (normalizedGithubUsername) {
    const byUsername = await getBypassAccountByOrgAndGithubUsername(
      params.orgId,
      normalizedGithubUsername
    )
    if (byUsername) return byUsername
  }

  return null
}

export async function setOrganizationActive(slug: string, isActive: boolean) {
  const db = await ensureDbReady()
  const rows = await db
    .update(organizations)
    .set({ isActive })
    .where(eq(organizations.githubOrgSlug, slug))
    .returning()
  return rows[0] ?? undefined
}

export async function createOrganization(data: {
  githubOrgSlug: string
  githubAccountType?: "organization" | "user"
  githubAccountId?: string | number | null
  name: string
  avatarUrl: string
  adminUserId: string
  installationId?: number
}) {
  const db = await ensureDbReady()

  const rows = await db
    .insert(organizations)
    .values({
      id: `org_${Date.now()}`,
      githubOrgSlug: data.githubOrgSlug,
      githubAccountType: data.githubAccountType ?? "organization",
      githubAccountId:
        data.githubAccountId === undefined || data.githubAccountId === null
          ? null
          : String(data.githubAccountId),
      name: data.name,
      avatarUrl: data.avatarUrl,
      installedAt: new Date().toISOString(),
      adminUserId: data.adminUserId,
      isActive: true,
      installationId: data.installationId ?? null,
      claText: "",
      claTextSha256: null,
    })
    .returning()

  return rows[0]
}

export async function updateOrganizationInstallationId(
  slug: string,
  installationId: number | null,
  options?: {
    githubAccountType?: "organization" | "user"
    githubAccountId?: string | number | null
  }
) {
  const db = await ensureDbReady()
  const updateData: {
    installationId: number | null
    githubAccountType?: "organization" | "user"
    githubAccountId?: string | null
  } = {
    installationId,
  }
  if (options?.githubAccountType) {
    updateData.githubAccountType = options.githubAccountType
  }
  if (options && "githubAccountId" in options) {
    updateData.githubAccountId =
      options.githubAccountId === undefined || options.githubAccountId === null
        ? null
        : String(options.githubAccountId)
  }

  const rows = await db
    .update(organizations)
    .set(updateData)
    .where(eq(organizations.githubOrgSlug, slug))
    .returning()
  return rows[0] ?? undefined
}

/**
 * Update the live CLA text for an org.
 * Only overwrites claText + claTextSha256 on the org row.
 * No archive row is created -- that happens lazily when someone signs.
 */
export async function updateOrganizationCla(slug: string, claText: string) {
  const db = await ensureDbReady()
  const hash = await sha256Hex(claText)

  const rows = await db
    .update(organizations)
    .set({ claText, claTextSha256: hash })
    .where(eq(organizations.githubOrgSlug, slug))
    .returning()

  return rows[0] ?? undefined
}

// ---------- CLA Archives ----------

/**
 * Ensure an archive exists for this org+sha256. If not, create one
 * using the provided CLA text. Returns the archive row.
 */
export async function getOrCreateArchive(orgId: string, hash: string, claText: string) {
  const db = await ensureDbReady()

  const existing = await db
    .select()
    .from(claArchives)
    .where(and(eq(claArchives.orgId, orgId), eq(claArchives.sha256, hash)))
    .limit(1)

  if (existing.length > 0) return existing[0]

  const rows = await db
    .insert(claArchives)
    .values({
      id: `archive_${Date.now()}`,
      orgId,
      sha256: hash,
      claText,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing({
      target: [claArchives.orgId, claArchives.sha256],
    })
    .returning()

  if (rows.length > 0) return rows[0]

  const fallback = await db
    .select()
    .from(claArchives)
    .where(and(eq(claArchives.orgId, orgId), eq(claArchives.sha256, hash)))
    .limit(1)
  return fallback[0]
}

export async function getArchivesByOrg(orgId: string) {
  const db = await ensureDbReady()
  return db
    .select()
    .from(claArchives)
    .where(eq(claArchives.orgId, orgId))
    .orderBy(desc(claArchives.createdAt))
}

export async function getArchiveById(id: string) {
  const db = await ensureDbReady()
  const rows = await db.select().from(claArchives).where(eq(claArchives.id, id)).limit(1)
  return rows[0] ?? undefined
}

export async function getArchiveByOrgAndSha(orgId: string, sha256: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(claArchives)
    .where(and(eq(claArchives.orgId, orgId), eq(claArchives.sha256, sha256)))
    .limit(1)
  return rows[0] ?? undefined
}

// ---------- Signatures ----------

export async function getSignaturesByOrg(orgId: string) {
  const db = await ensureDbReady()
  const rows = await db
    .selectDistinctOn([claSignatures.userId], {
      id: claSignatures.id,
      userId: claSignatures.userId,
      name: claSignatures.name,
      githubUsername: claSignatures.githubUsername,
      avatarUrl: claSignatures.avatarUrl,
      signedAt: claSignatures.signedAt,
      claSha256: claSignatures.claSha256,
    })
    .from(claSignatures)
    .where(eq(claSignatures.orgId, orgId))
    .orderBy(claSignatures.userId, desc(claSignatures.signedAt), desc(claSignatures.id))

  return rows.sort((a, b) => b.signedAt.localeCompare(a.signedAt))
}

export async function getSignerCountsByClaSha(orgId: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select({
      claSha256: claSignatures.claSha256,
      signerCount: sql<number>`count(distinct ${claSignatures.userId})`,
    })
    .from(claSignatures)
    .where(eq(claSignatures.orgId, orgId))
    .groupBy(claSignatures.claSha256)

  return Object.fromEntries(rows.map((row) => [row.claSha256, Number(row.signerCount)]))
}

export async function getSignaturesByUser(userId: string) {
  const db = await ensureDbReady()
  return db.select().from(claSignatures).where(eq(claSignatures.userId, userId))
}

export async function getSignatureById(id: string) {
  const db = await ensureDbReady()
  const rows = await db.select().from(claSignatures).where(eq(claSignatures.id, id)).limit(1)
  return rows[0] ?? undefined
}

export async function getSignature(orgId: string, userId: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(claSignatures)
    .where(and(eq(claSignatures.orgId, orgId), eq(claSignatures.userId, userId)))
    .orderBy(desc(claSignatures.signedAt))
    .limit(1)
  return rows[0] ?? undefined
}

export async function getSignatureForExactVersion(
  orgId: string,
  userId: string,
  claSha256: string
) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(claSignatures)
    .where(
      and(
        eq(claSignatures.orgId, orgId),
        eq(claSignatures.userId, userId),
        eq(claSignatures.claSha256, claSha256)
      )
    )
    .limit(1)
  return rows[0] ?? undefined
}

/**
 * Check CLA signature status by comparing sha256 hashes.
 * - signed + currentVersion => contributor signed the current CLA text
 * - signed + !currentVersion => contributor signed an older CLA text (needs re-sign)
 * - !signed => contributor has never signed any CLA for this org
 */
export async function getSignatureStatus(orgSlug: string, userId: string) {
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return { signed: false, currentVersion: false, signature: null, currentSha256: null }
  }

  const sig = await getSignature(org.id, userId)
  if (!sig) {
    return {
      signed: false,
      currentVersion: false,
      signature: null,
      currentSha256: org.claTextSha256,
    }
  }

  const isCurrent = sig.claSha256 === org.claTextSha256
  return {
    signed: true,
    currentVersion: isCurrent,
    signature: sig,
    currentSha256: org.claTextSha256,
  }
}

/**
 * Resolve signature status using immutable GitHub user ID.
 * Used by webhook handlers when checking PR authorship.
 */
export async function getSignatureStatusByGithubId(orgSlug: string, githubId: string | number) {
  const user = await getUserByGithubId(githubId)
  if (!user) {
    const org = await getOrganizationBySlug(orgSlug)
    return {
      signed: false,
      currentVersion: false,
      signature: null,
      currentSha256: org?.claTextSha256 ?? null,
    }
  }
  return getSignatureStatus(orgSlug, user.id)
}

/**
 * Compatibility fallback for legacy payloads with no GitHub numeric ID.
 */
export async function getSignatureStatusByUsername(orgSlug: string, githubUsername: string) {
  const user = await getUserByUsername(githubUsername)
  if (!user) {
    const org = await getOrganizationBySlug(orgSlug)
    return {
      signed: false,
      currentVersion: false,
      signature: null,
      currentSha256: org?.claTextSha256 ?? null,
    }
  }
  return getSignatureStatus(orgSlug, user.id)
}

/**
 * Create a signature for a user on an org's current CLA.
 * Lazily creates an archive if one doesn't exist for the current sha256.
 * Idempotent per (orgId, userId, claSha256).
 */
export async function createSignature(data: {
  orgId: string
  userId: string
  claSha256: string
  acceptedSha256: string
  consentTextVersion: string
  assented: boolean
  claText: string
  githubUserIdAtSignature: string
  githubUsername: string
  emailAtSignature: string
  emailVerifiedAtSignature: boolean
  emailSource: string
  sessionJti: string
  ipHash?: string | null
  userAgent?: string | null
  name: string
  avatarUrl: string
}) {
  const db = await ensureDbReady()

  await getOrCreateArchive(data.orgId, data.claSha256, data.claText)

  const rows = await db
    .insert(claSignatures)
    .values({
      id: `sig_${Date.now()}`,
      orgId: data.orgId,
      userId: data.userId,
      claSha256: data.claSha256,
      acceptedSha256: data.acceptedSha256,
      consentTextVersion: data.consentTextVersion,
      assented: data.assented,
      signedAt: new Date().toISOString(),
      githubUserIdAtSignature: data.githubUserIdAtSignature,
      githubUsername: data.githubUsername,
      emailAtSignature: data.emailAtSignature,
      emailVerifiedAtSignature: data.emailVerifiedAtSignature,
      emailSource: data.emailSource,
      sessionJti: data.sessionJti,
      ipHash: data.ipHash ?? null,
      userAgent: data.userAgent ?? null,
      name: data.name,
      avatarUrl: data.avatarUrl,
    })
    .onConflictDoNothing({
      target: [claSignatures.orgId, claSignatures.userId, claSignatures.claSha256],
    })
    .returning()

  if (rows.length > 0) return rows[0]

  const existing = await getSignatureForExactVersion(data.orgId, data.userId, data.claSha256)
  if (!existing) {
    throw new Error("Failed to create or load signature record")
  }
  return existing
}

export async function hasUserSignedCurrentCla(orgSlug: string, userId: string) {
  const status = await getSignatureStatus(orgSlug, userId)
  return status.signed && status.currentVersion
}

// ---------- Webhook deliveries ----------

/**
 * Reserve a delivery ID. Returns false when the delivery was already processed.
 */
export async function reserveWebhookDelivery(deliveryId: string, event: string) {
  try {
    const db = await ensureDbReady()
    const rows = await db
      .insert(webhookDeliveries)
      .values({
        deliveryId,
        event,
        receivedAt: new Date().toISOString(),
      })
      .onConflictDoNothing({
        target: [webhookDeliveries.deliveryId],
      })
      .returning()

    return rows.length > 0
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && isMissingRelationError(error)) {
      return true
    }
    throw error
  }
}

// ---------- Audit events ----------

export async function createAuditEvent(data: {
  eventType: string
  orgId?: string | null
  userId?: string | null
  actorGithubId?: string | null
  actorGithubUsername?: string | null
  payload?: Record<string, unknown>
}) {
  try {
    const db = await ensureDbReady()
    const rows = await db
      .insert(auditEvents)
      .values({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        eventType: data.eventType,
        orgId: data.orgId ?? null,
        userId: data.userId ?? null,
        actorGithubId: data.actorGithubId ?? null,
        actorGithubUsername: data.actorGithubUsername ?? null,
        payload: data.payload ?? {},
        createdAt: new Date().toISOString(),
      })
      .returning()

    return rows[0]
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && isMissingRelationError(error)) {
      return null
    }
    throw error
  }
}

function isMissingRelationError(error: unknown) {
  if (!(error instanceof Error)) return false
  return /relation .* does not exist/i.test(error.message)
}

// ---------- Reset (dev/testing only) ----------

export async function resetDatabase() {
  await resetDb()
}
