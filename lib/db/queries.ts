/**
 * Database query layer — replaces lib/mock-db.ts
 *
 * All functions use Drizzle ORM and hit the Neon Postgres database.
 * Session/role management stays in-memory (not a DB concern).
 *
 * Data model:
 *  - organizations.claText + organizations.claTextSha256 = the live CLA
 *  - cla_archives = snapshot created lazily when someone signs a given sha256
 *  - cla_signatures.claSha256 = the sha256 the user signed
 *
 * The GitHub-specific stores (check runs, bot comments, org membership) are NOT here.
 * They live in lib/github/ (mock client in dev, Octokit in prod).
 */

import { eq, and, desc } from "drizzle-orm"
import { ensureDbReady, resetDb } from "./index"
import {
  users,
  organizations,
  claArchives,
  claSignatures,
} from "./schema"
import { sha256Hex } from "./sha256"

// ---------- Session / Auth (in-memory, not DB) ----------

const ADMIN_USER = {
  id: "user_1",
  githubUsername: "orgadmin",
  avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=OA&backgroundColor=059669",
  name: "Org Admin",
  role: "admin" as const,
}

const CONTRIBUTOR_USER = {
  id: "user_2",
  githubUsername: "contributor1",
  avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
  name: "Jane Contributor",
  role: "contributor" as const,
}

let currentRole: "admin" | "contributor" = "admin"

export function getSessionUser() {
  return currentRole === "admin" ? { ...ADMIN_USER } : { ...CONTRIBUTOR_USER }
}

export function setCurrentRole(role: "admin" | "contributor") {
  currentRole = role
}

export function getCurrentRole() {
  return currentRole
}

// ---------- Users ----------

export async function getUserById(id: string) {
  const db = await ensureDbReady()
  const rows = await db.select().from(users).where(eq(users.id, id))
  return rows[0] ?? undefined
}

export async function getUserByUsername(username: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.githubUsername, username))
  return rows[0] ?? undefined
}

/**
 * Create or update a user from GitHub OAuth data.
 * Used during the OAuth callback to ensure the user exists in the DB.
 */
export async function upsertUser(data: {
  githubId: number
  githubUsername: string
  avatarUrl: string
  name: string
  role?: "admin" | "contributor"
}) {
  const db = await ensureDbReady()

  // Check if user exists by GitHub username
  const existing = await getUserByUsername(data.githubUsername)
  if (existing) {
    // Update avatar/name/githubId if changed
    const rows = await db
      .update(users)
      .set({
        avatarUrl: data.avatarUrl,
        name: data.name || existing.name,
        githubId: data.githubId,
      })
      .where(eq(users.id, existing.id))
      .returning()
    return rows[0]
  }

  // Create new user
  const rows = await db
    .insert(users)
    .values({
      id: `user_${Date.now()}`,
      githubUsername: data.githubUsername,
      githubId: data.githubId,
      avatarUrl: data.avatarUrl,
      name: data.name || data.githubUsername,
      role: data.role ?? "contributor",
    })
    .returning()
  return rows[0]
}

// ---------- Organizations ----------

export async function getOrganizations() {
  const db = await ensureDbReady()
  return db.select().from(organizations)
}

export async function getOrganizationsByAdmin(adminUserId: string) {
  const db = await ensureDbReady()
  return db
    .select()
    .from(organizations)
    .where(eq(organizations.adminUserId, adminUserId))
}

export async function getOrganizationBySlug(slug: string) {
  const db = await ensureDbReady()
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.githubOrgSlug, slug))
  return rows[0] ?? undefined
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
  name: string
  avatarUrl: string
  adminUserId: string
  installationId?: number
}) {
  const db = await ensureDbReady()
  const { DEFAULT_CLA_MARKDOWN } = await import("./seed")
  const hash = await sha256Hex(DEFAULT_CLA_MARKDOWN)

  const rows = await db
    .insert(organizations)
    .values({
      id: `org_${Date.now()}`,
      githubOrgSlug: data.githubOrgSlug,
      name: data.name,
      avatarUrl: data.avatarUrl,
      installedAt: new Date().toISOString(),
      adminUserId: data.adminUserId,
      isActive: true,
      installationId: data.installationId ?? null,
      claText: DEFAULT_CLA_MARKDOWN,
      claTextSha256: hash,
    })
    .returning()

  return rows[0]
}

export async function updateOrganizationInstallationId(slug: string, installationId: number) {
  const db = await ensureDbReady()
  const rows = await db
    .update(organizations)
    .set({ installationId })
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
    .returning()

  return rows[0]
}

export async function getArchivesByOrg(orgId: string) {
  const db = await ensureDbReady()
  return db
    .select()
    .from(claArchives)
    .where(eq(claArchives.orgId, orgId))
    .orderBy(desc(claArchives.createdAt))
}

// ---------- Signatures ----------

export async function getSignaturesByOrg(orgId: string) {
  const db = await ensureDbReady()
  return db
    .select()
    .from(claSignatures)
    .where(eq(claSignatures.orgId, orgId))
}

export async function getSignaturesByUser(userId: string) {
  const db = await ensureDbReady()
  return db
    .select()
    .from(claSignatures)
    .where(eq(claSignatures.userId, userId))
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
 * Same as getSignatureStatus but looks up the user by GitHub username first.
 * Used by the webhook handler which only knows the PR author's username.
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
 */
export async function createSignature(data: {
  orgId: string
  userId: string
  claSha256: string
  claText: string
  githubUsername: string
  name: string
  avatarUrl: string
}) {
  const db = await ensureDbReady()

  // Ensure an archive snapshot exists for the text being signed
  await getOrCreateArchive(data.orgId, data.claSha256, data.claText)

  const rows = await db
    .insert(claSignatures)
    .values({
      id: `sig_${Date.now()}`,
      orgId: data.orgId,
      userId: data.userId,
      claSha256: data.claSha256,
      signedAt: new Date().toISOString(),
      githubUsername: data.githubUsername,
      name: data.name,
      avatarUrl: data.avatarUrl,
    })
    .returning()

  return rows[0]
}

export async function clearSignaturesForUser(orgSlug: string, githubUsername: string) {
  const db = await ensureDbReady()
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) return 0

  const result = await db
    .delete(claSignatures)
    .where(
      and(
        eq(claSignatures.orgId, org.id),
        eq(claSignatures.githubUsername, githubUsername)
      )
    )
    .returning()

  return result.length
}

export async function hasUserSignedCurrentCla(orgSlug: string, userId: string) {
  const status = await getSignatureStatus(orgSlug, userId)
  return status.signed && status.currentVersion
}

// ---------- Reset (dev/testing only) ----------

export async function resetDatabase() {
  await resetDb()
  currentRole = "admin"
}
