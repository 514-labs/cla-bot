/**
 * Mock in-memory database layer.
 *
 * This module simulates a Neon Postgres database with mutable state.
 * All functions mirror what real SQL queries would do.
 * Replace each function body with actual Neon `sql` calls in production.
 */

import {
  type User,
  type Organization,
  type ClaVersion,
  type ClaSignature,
  type CheckRun,
  type CheckRunStatus,
  type BotComment,
  type OrgMember,
  MOCK_ADMIN_USER,
  MOCK_CONTRIBUTOR_USER,
  MOCK_ORGANIZATIONS,
  MOCK_CLA_VERSIONS,
  MOCK_SIGNATURES,
  MOCK_ORG_MEMBERS,
  DEFAULT_CLA_MARKDOWN,
} from "./mock-data"

// ---------- In-memory stores (mutable) ----------

let users: User[] = [{ ...MOCK_ADMIN_USER }, { ...MOCK_CONTRIBUTOR_USER }]

let organizations: Organization[] = MOCK_ORGANIZATIONS.map((o) => ({ ...o }))

let claVersions: ClaVersion[] = MOCK_CLA_VERSIONS.map((v) => ({ ...v }))

let signatures: ClaSignature[] = MOCK_SIGNATURES.map((s) => ({ ...s }))

let orgMembers: OrgMember[] = MOCK_ORG_MEMBERS.map((m) => ({ ...m }))

let checkRuns: CheckRun[] = []
let botComments: BotComment[] = []

let nextSigId = signatures.length + 1
let nextOrgId = organizations.length + 1
let nextVerId = claVersions.length + 1
let nextCheckId = 1
let nextCommentId = 1

// Current session (mock). In production this is a secure HTTP-only cookie.
let currentRole: "admin" | "contributor" = "admin"

// ---------- Session / Auth ----------

export function getSessionUser(): User {
  return currentRole === "admin" ? { ...MOCK_ADMIN_USER } : { ...MOCK_CONTRIBUTOR_USER }
}

export function setCurrentRole(role: "admin" | "contributor") {
  currentRole = role
}

export function getCurrentRole(): "admin" | "contributor" {
  return currentRole
}

// ---------- Users ----------

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function getUserByUsername(username: string): User | undefined {
  return users.find((u) => u.githubUsername === username)
}

// ---------- Organizations ----------

export function getOrganizations(): Organization[] {
  return organizations.map((o) => ({ ...o }))
}

export function getOrganizationsByAdmin(adminUserId: string): Organization[] {
  return organizations
    .filter((o) => o.adminUserId === adminUserId)
    .map((o) => ({ ...o }))
}

export function getOrganizationBySlug(slug: string): Organization | undefined {
  const org = organizations.find((o) => o.githubOrgSlug === slug)
  return org ? { ...org } : undefined
}

export function setOrganizationActive(slug: string, isActive: boolean): Organization | undefined {
  const org = organizations.find((o) => o.githubOrgSlug === slug)
  if (org) {
    org.isActive = isActive
    return { ...org }
  }
  return undefined
}

export function createOrganization(data: {
  githubOrgSlug: string
  name: string
  avatarUrl: string
  adminUserId: string
}): Organization {
  const orgId = `org_${nextOrgId++}`
  // Create initial CLA version
  const version = createClaVersion(orgId, DEFAULT_CLA_MARKDOWN)
  const org: Organization = {
    id: orgId,
    githubOrgSlug: data.githubOrgSlug,
    name: data.name,
    avatarUrl: data.avatarUrl,
    installedAt: new Date().toISOString(),
    adminUserId: data.adminUserId,
    isActive: true,
    currentClaVersionId: version.id,
  }
  organizations.push(org)
  return { ...org }
}

// ---------- CLA Versions ----------

export function createClaVersion(orgId: string, claMarkdown: string): ClaVersion {
  const orgVersions = claVersions.filter((v) => v.orgId === orgId)
  const nextVersion = orgVersions.length > 0 ? Math.max(...orgVersions.map((v) => v.version)) + 1 : 1
  const ver: ClaVersion = {
    id: `ver_${nextVerId++}`,
    orgId,
    version: nextVersion,
    claMarkdown,
    createdAt: new Date().toISOString(),
  }
  claVersions.push(ver)
  return { ...ver }
}

export function getClaVersionById(versionId: string): ClaVersion | undefined {
  const v = claVersions.find((v) => v.id === versionId)
  return v ? { ...v } : undefined
}

export function getClaVersionsByOrg(orgId: string): ClaVersion[] {
  return claVersions
    .filter((v) => v.orgId === orgId)
    .sort((a, b) => b.version - a.version)
    .map((v) => ({ ...v }))
}

export function getCurrentClaVersion(orgSlug: string): ClaVersion | undefined {
  const org = organizations.find((o) => o.githubOrgSlug === orgSlug)
  if (!org || !org.currentClaVersionId) return undefined
  return getClaVersionById(org.currentClaVersionId)
}

/**
 * Saves a new CLA version for the org and updates the org's currentClaVersionId.
 * Returns the updated org and the new version.
 */
export function updateOrganizationCla(
  slug: string,
  claMarkdown: string
): { org: Organization; version: ClaVersion } | undefined {
  const org = organizations.find((o) => o.githubOrgSlug === slug)
  if (!org) return undefined

  const newVersion = createClaVersion(org.id, claMarkdown)
  org.currentClaVersionId = newVersion.id

  return { org: { ...org }, version: { ...newVersion } }
}

// ---------- Signatures ----------

export function getSignaturesByOrg(orgId: string): ClaSignature[] {
  return signatures.filter((s) => s.orgId === orgId).map((s) => ({ ...s }))
}

export function getSignaturesByUser(userId: string): ClaSignature[] {
  return signatures.filter((s) => s.userId === userId).map((s) => ({ ...s }))
}

/**
 * Get a user's signature for a specific org.
 * Returns the most recent signature regardless of version.
 */
export function getSignature(orgId: string, userId: string): ClaSignature | undefined {
  const sigs = signatures.filter((s) => s.orgId === orgId && s.userId === userId)
  if (sigs.length === 0) return undefined
  // Return the most recent
  sigs.sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())
  return { ...sigs[0] }
}

/**
 * Check if a user's signature is for the current CLA version.
 * Returns { signed: boolean, currentVersion: boolean, signature? }
 */
export function getSignatureStatus(
  orgSlug: string,
  userId: string
): {
  signed: boolean
  currentVersion: boolean
  signature: ClaSignature | null
  currentClaVersionId: string | null
} {
  const org = organizations.find((o) => o.githubOrgSlug === orgSlug)
  if (!org) return { signed: false, currentVersion: false, signature: null, currentClaVersionId: null }

  const sig = getSignature(org.id, userId)
  if (!sig) {
    return { signed: false, currentVersion: false, signature: null, currentClaVersionId: org.currentClaVersionId }
  }

  const isCurrent = sig.claVersionId === org.currentClaVersionId
  return {
    signed: true,
    currentVersion: isCurrent,
    signature: sig,
    currentClaVersionId: org.currentClaVersionId,
  }
}

export function createSignature(data: {
  orgId: string
  userId: string
  claVersionId: string
  githubUsername: string
  name: string
  avatarUrl: string
}): ClaSignature {
  const sig: ClaSignature = {
    id: `sig_${nextSigId++}`,
    orgId: data.orgId,
    userId: data.userId,
    claVersionId: data.claVersionId,
    signedAt: new Date().toISOString(),
    githubUsername: data.githubUsername,
    name: data.name,
    avatarUrl: data.avatarUrl,
  }
  signatures.push(sig)
  return { ...sig }
}

/**
 * Remove all CLA signatures for a specific user on an org.
 * Used in test/preview to simulate a truly unsigned contributor.
 */
export function clearSignaturesForUser(orgSlug: string, githubUsername: string): number {
  const org = organizations.find((o) => o.githubOrgSlug === orgSlug)
  if (!org) return 0
  const user = users.find((u) => u.githubUsername === githubUsername)
  if (!user) return 0
  const before = signatures.length
  signatures = signatures.filter(
    (s) => !(s.orgId === org.id && s.userId === user.id)
  )
  return before - signatures.length
}

export function hasUserSignedCurrentCla(orgSlug: string, userId: string): boolean {
  const status = getSignatureStatus(orgSlug, userId)
  return status.signed && status.currentVersion
}

/**
 * Check CLA signature status using a GitHub username directly.
 * This is the primary lookup used by the webhook handler, since the
 * webhook only knows the PR author's GitHub username, not our internal user ID.
 */
export function getSignatureStatusByUsername(
  orgSlug: string,
  githubUsername: string
): {
  signed: boolean
  currentVersion: boolean
  signature: ClaSignature | null
  currentClaVersionId: string | null
} {
  const user = getUserByUsername(githubUsername)
  if (!user) {
    const org = organizations.find((o) => o.githubOrgSlug === orgSlug)
    return {
      signed: false,
      currentVersion: false,
      signature: null,
      currentClaVersionId: org?.currentClaVersionId ?? null,
    }
  }
  return getSignatureStatus(orgSlug, user.id)
}

// ---------- Org Membership ----------

export function isOrgMember(orgSlug: string, githubUsername: string): boolean {
  const org = organizations.find((o) => o.githubOrgSlug === orgSlug)
  if (!org) return false
  return orgMembers.some((m) => m.orgId === org.id && m.githubUsername === githubUsername)
}

export function getOrgMembers(orgId: string): OrgMember[] {
  return orgMembers.filter((m) => m.orgId === orgId).map((m) => ({ ...m }))
}

// ---------- Pending PR check auto-update on signing ----------

/**
 * After a user signs a CLA, update all their pending failing check runs to success.
 * This simulates the real GitHub API where we'd call the Checks API to update status.
 */
export function autoUpdateChecksForUser(orgSlug: string, githubUsername: string): CheckRun[] {
  const org = organizations.find((o) => o.githubOrgSlug === orgSlug)
  if (!org) return []

  const updated: CheckRun[] = []
  for (const check of checkRuns) {
    if (check.orgId === org.id && check.prAuthor === githubUsername && check.status === "failure") {
      check.status = "success"
      check.updatedAt = new Date().toISOString()
      updated.push({ ...check })
    }
  }
  return updated
}

// ---------- Check Runs (PR status checks) ----------

export function createCheckRun(data: {
  orgId: string
  repoName: string
  prNumber: number
  prAuthor: string
  headSha: string
  status: CheckRunStatus
}): CheckRun {
  const now = new Date().toISOString()
  const check: CheckRun = {
    id: `check_${nextCheckId++}`,
    orgId: data.orgId,
    repoName: data.repoName,
    prNumber: data.prNumber,
    prAuthor: data.prAuthor,
    headSha: data.headSha,
    status: data.status,
    createdAt: now,
    updatedAt: now,
  }
  checkRuns.push(check)
  return { ...check }
}

export function getCheckRun(orgId: string, repoName: string, prNumber: number): CheckRun | undefined {
  // Return the most recent check for this PR
  const checks = checkRuns.filter(
    (c) => c.orgId === orgId && c.repoName === repoName && c.prNumber === prNumber
  )
  if (checks.length === 0) return undefined
  return { ...checks[checks.length - 1] }
}

export function updateCheckRunStatus(
  orgId: string,
  repoName: string,
  prNumber: number,
  status: CheckRunStatus
): CheckRun | undefined {
  const checks = checkRuns.filter(
    (c) => c.orgId === orgId && c.repoName === repoName && c.prNumber === prNumber
  )
  if (checks.length === 0) return undefined
  const latest = checks[checks.length - 1]
  latest.status = status
  latest.updatedAt = new Date().toISOString()
  return { ...latest }
}

export function getCheckRunsByOrg(orgId: string): CheckRun[] {
  return checkRuns.filter((c) => c.orgId === orgId).map((c) => ({ ...c }))
}

// ---------- Bot Comments (PR comments) ----------

export function createBotComment(data: {
  orgId: string
  repoName: string
  prNumber: number
  prAuthor: string
  commentMarkdown: string
}): BotComment {
  const comment: BotComment = {
    id: `comment_${nextCommentId++}`,
    orgId: data.orgId,
    repoName: data.repoName,
    prNumber: data.prNumber,
    prAuthor: data.prAuthor,
    commentMarkdown: data.commentMarkdown,
    createdAt: new Date().toISOString(),
  }
  botComments.push(comment)
  return { ...comment }
}

export function getBotComments(orgId: string, repoName: string, prNumber: number): BotComment[] {
  return botComments
    .filter((c) => c.orgId === orgId && c.repoName === repoName && c.prNumber === prNumber)
    .map((c) => ({ ...c }))
}

export function getLatestBotComment(orgId: string, repoName: string, prNumber: number): BotComment | undefined {
  const comments = getBotComments(orgId, repoName, prNumber)
  return comments.length > 0 ? comments[comments.length - 1] : undefined
}

// ---------- Reset (for testing) ----------

export function resetDatabase() {
  users = [{ ...MOCK_ADMIN_USER }, { ...MOCK_CONTRIBUTOR_USER }]
  organizations = MOCK_ORGANIZATIONS.map((o) => ({ ...o }))
  claVersions = MOCK_CLA_VERSIONS.map((v) => ({ ...v }))
  signatures = MOCK_SIGNATURES.map((s) => ({ ...s }))
  orgMembers = MOCK_ORG_MEMBERS.map((m) => ({ ...m }))
  checkRuns = []
  botComments = []
  nextSigId = signatures.length + 1
  nextOrgId = organizations.length + 1
  nextVerId = claVersions.length + 1
  nextCheckId = 1
  nextCommentId = 1
  currentRole = "admin"
}
