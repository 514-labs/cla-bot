import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { afterAll, beforeAll, expect, test as vitestTest } from "vitest"
import { resetTestDatabase } from "@/tests/utils/db-reset"
import { TEST_USERS, type TestRole } from "@/tests/utils/fixtures"
import { clearSessionCookieCache, getSessionCookie } from "@/tests/utils/session"
import { startIntegrationServer } from "@/tests/utils/integration-server"
import { signClaForUser, SignClaError } from "@/lib/cla/signing"
import { scheduleSignerPrSyncAfterSign } from "@/lib/cla/signer-pr-sync-scheduler"
import {
  getOrganizations,
  getOrganizationBySlug,
  getSignaturesByOrg,
  getArchivesByOrg,
  getSignerCountsByClaSha,
  getSignaturesByUser,
  getSignatureStatus,
} from "@/lib/db/queries"
import { filterInstalledOrganizationsForAdmin } from "@/lib/github/admin-authorization"

type TestResult = {
  name: string
  passed: boolean
  error?: string
  duration: number
}

type TestFn = (baseUrl: string) => Promise<void>

const tests: { name: string; fn: TestFn }[] = []

function test(name: string, fn: TestFn) {
  tests.push({ name, fn })
}

const nativeFetch = globalThis.fetch.bind(globalThis)
let currentRole: TestRole = "admin"
let baseUrl = ""
let stopIntegrationServer: (() => Promise<void>) | null = null
const TEST_DATABASE_URL = process.env.DATABASE_URL ?? readDatabaseUrlFromEnvLocal()
if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run integration tests")
}
function isNeonUrl(url: string): boolean {
  return /neon\.tech|neondb\.net/.test(url)
}

type RawSqlFn = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>

const sql: RawSqlFn = isNeonUrl(TEST_DATABASE_URL)
  ? (neon(TEST_DATABASE_URL) as unknown as RawSqlFn)
  : (postgres(TEST_DATABASE_URL) as unknown as RawSqlFn)

beforeAll(async () => {
  const server = await startIntegrationServer()
  baseUrl = server.baseUrl
  stopIntegrationServer = server.stop
}, 120_000)

afterAll(async () => {
  await stopIntegrationServer?.()
})

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const sessionCookie = await getSessionCookie(currentRole)
  const existingCookie = headers.get("cookie")
  headers.set("cookie", existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie)
  return nativeFetch(input, { ...init, headers })
}

async function resetDb(_baseUrl: string) {
  await resetTestDatabase()
  clearSessionCookieCache()
  currentRole = "admin"
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function switchRole(_baseUrl: string, role: TestRole) {
  currentRole = role
  return {
    role,
    user: TEST_USERS[role],
  }
}

async function updateClaForOrg(orgSlug: string, claMarkdown: string) {
  const hash = sha256Hex(claMarkdown)
  const rows = await sql`
    UPDATE organizations
    SET cla_text = ${claMarkdown},
        cla_text_sha256 = ${hash}
    WHERE github_org_slug = ${orgSlug}
    RETURNING id, cla_text AS "claText", cla_text_sha256 AS "claTextSha256"
  `
  const org = rows[0]
  assert(org !== undefined, `org exists for CLA update (${orgSlug})`)
  return org
}

async function setOrgActiveForTest(orgSlug: string, isActive: boolean) {
  const rows = await sql`
    UPDATE organizations
    SET is_active = ${isActive}
    WHERE github_org_slug = ${orgSlug}
    RETURNING id, is_active AS "isActive"
  `
  const org = rows[0]
  assert(org !== undefined, `org exists for activation toggle (${orgSlug})`)
  return org
}

async function addBypassAccountForOrg(params: {
  orgSlug: string
  bypassKind?: "user" | "app_bot"
  githubUserId?: string
  githubUsername: string
  actorSlug?: string
}) {
  const bypassKind = params.bypassKind ?? "user"
  const githubUserId = params.githubUserId ?? null
  const actorSlug = params.actorSlug ?? null

  const rows =
    bypassKind === "app_bot"
      ? await sql`
          INSERT INTO org_cla_bypass_accounts (id, org_id, bypass_kind, github_user_id, github_username, actor_slug, created_by_user_id, created_at)
          SELECT ${`bypass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}, id, 'app_bot', ${null}, ${params.githubUsername}, ${actorSlug}, 'user_1', NOW()::text
          FROM organizations
          WHERE github_org_slug = ${params.orgSlug}
          ON CONFLICT (org_id, bypass_kind, actor_slug) DO NOTHING
          RETURNING id
        `
      : await sql`
          INSERT INTO org_cla_bypass_accounts (id, org_id, bypass_kind, github_user_id, github_username, actor_slug, created_by_user_id, created_at)
          SELECT ${`bypass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}, id, 'user', ${githubUserId}, ${params.githubUsername}, ${null}, 'user_1', NOW()::text
          FROM organizations
          WHERE github_org_slug = ${params.orgSlug}
          ON CONFLICT (org_id, bypass_kind, github_user_id) DO NOTHING
          RETURNING id
        `
  assert(rows.length > 0, `bypass account inserted for ${params.orgSlug}`)
}

async function removeBypassAccountForOrg(params: {
  orgSlug: string
  bypassKind?: "user" | "app_bot"
  githubUserId?: string
  actorSlug?: string
}) {
  const bypassKind = params.bypassKind ?? "user"
  const rows =
    bypassKind === "app_bot"
      ? await sql`
          DELETE FROM org_cla_bypass_accounts
          WHERE org_id = (
            SELECT id FROM organizations WHERE github_org_slug = ${params.orgSlug}
          )
            AND bypass_kind = 'app_bot'
            AND actor_slug = ${params.actorSlug ?? null}
          RETURNING id
        `
      : await sql`
          DELETE FROM org_cla_bypass_accounts
          WHERE org_id = (
            SELECT id FROM organizations WHERE github_org_slug = ${params.orgSlug}
          )
            AND bypass_kind = 'user'
            AND github_user_id = ${params.githubUserId ?? null}
          RETURNING id
        `
  assert(rows.length > 0, `bypass account removed for ${params.orgSlug}`)
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

async function signCla(params: {
  orgSlug: string
  role?: TestRole
  repoName?: string | null
  prNumber?: number | string | null
  acceptedSha256?: string
}) {
  const role = params.role ?? currentRole
  const user = TEST_USERS[role]
  const signResult = await signClaForUser({
    orgSlug: params.orgSlug,
    user: { ...user, sessionJti: `test-jti-${role}` },
    repoName: params.repoName,
    prNumber: params.prNumber,
    acceptedSha256: params.acceptedSha256,
    assented: true,
    consentTextVersion: "v1",
  })
  const scheduleResult = await scheduleSignerPrSyncAfterSign({
    signResult,
    actor: {
      userId: user.id,
      githubId: user.githubId,
      githubUsername: user.githubUsername,
    },
  })
  return { signature: signResult.signature, ...scheduleResult }
}

async function getContributorData(userId: string) {
  const [signatures, allOrgs] = await Promise.all([getSignaturesByUser(userId), getOrganizations()])
  const sorted = [...signatures].sort((a, b) => b.signedAt.localeCompare(a.signedAt))
  const orgById = new Map(allOrgs.map((org) => [org.id, org]))
  const latestByOrg = new Map<string, (typeof sorted)[number]>()
  const orgsWithCurrentSig = new Set<string>()
  for (const sig of sorted) {
    if (!latestByOrg.has(sig.orgId)) {
      latestByOrg.set(sig.orgId, sig)
    }
    const org = orgById.get(sig.orgId)
    if (org?.claTextSha256 && sig.claSha256 === org.claTextSha256) {
      orgsWithCurrentSig.add(sig.orgId)
    }
  }
  const enriched = sorted.map((sig) => {
    const org = orgById.get(sig.orgId)
    return {
      ...sig,
      orgSlug: org?.githubOrgSlug ?? "",
      isCurrentVersion: sig.claSha256 === org?.claTextSha256,
      isLatestForOrg: latestByOrg.get(sig.orgId)?.id === sig.id,
      orgNeedsResign: !orgsWithCurrentSig.has(sig.orgId),
      signedVersionLabel: sig.claSha256.slice(0, 7),
    }
  })
  const signedOrgCount = latestByOrg.size
  const outdatedOrgCount = [...latestByOrg.keys()].filter(
    (orgId) => !orgsWithCurrentSig.has(orgId)
  ).length
  return { signatures: enriched, signedOrgCount, outdatedOrgCount, user: TEST_USERS[currentRole] }
}

function readDatabaseUrlFromEnvLocal() {
  const envLocalPath = resolve(process.cwd(), ".env.local")
  if (!existsSync(envLocalPath)) return undefined

  const contents = readFileSync(envLocalPath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separatorIndex = line.indexOf("=")
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (key !== "DATABASE_URL") continue

    const value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1)
    }
    return value
  }

  return undefined
}

// ==========================================
// 1. AUTH & SESSION TESTS
// ==========================================

test("Session setup: default active user is admin", async (baseUrl) => {
  await resetDb(baseUrl)
  const user = TEST_USERS.admin
  assertEqual(user.role, "admin", "role")
  assertEqual(user.githubUsername, "orgadmin", "username")
})

test("Role switch helper updates active user to contributor", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const user = TEST_USERS.contributor
  assertEqual(user.role, "contributor", "role")
  assertEqual(user.githubUsername, "contributor1", "username")
})

test("Role switch helper can return to admin", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  await switchRole(baseUrl, "admin")
  const user = TEST_USERS.admin
  assertEqual(user.role, "admin", "role")
  assertEqual(user.name, "Org Admin", "name")
})

test("GET /api/github/install callback returns to admin instead of looping to GitHub", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(
    `${baseUrl}/api/github/install?setup_action=install&installation_id=123&state=%2Fadmin`,
    {
      redirect: "manual",
    }
  )
  assertEqual(res.status, 307, "status")
  const location = res.headers.get("location") ?? ""
  assert(location.includes("/admin"), "redirects to admin")
  assert(location.includes("fromInstall=1"), "includes install callback marker")
  assert(location.includes("setup_action=install"), "preserves setup action")
  assert(location.includes("installation_id=123"), "preserves installation id")
  assert(!location.includes("github.com/apps/"), "does not redirect back to GitHub install")
})

// ==========================================
// 2. ADMIN ORG LISTING TESTS
// ==========================================

test("Admin orgs listing returns admin's orgs", async (baseUrl) => {
  await resetDb(baseUrl)
  const allOrgs = await getOrganizations()
  const orgs = await filterInstalledOrganizationsForAdmin(TEST_USERS.admin, allOrgs)
  assert(Array.isArray(orgs), "orgs is array")
  assertEqual(orgs.length, 2, "org count")
  const slugs = orgs.map((o) => o.githubOrgSlug).sort()
  assert(slugs.includes("fiveonefour"), "fiveonefour in orgs")
  assert(slugs.includes("moose-stack"), "moose-stack in orgs")
})

test("Admin orgs listing returns empty for contributor (no admin orgs)", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const allOrgs = await getOrganizations()
  const orgs = await filterInstalledOrganizationsForAdmin(TEST_USERS.contributor, allOrgs)
  assertEqual(orgs.length, 0, "contributor should have no admin orgs")
})

// ==========================================
// 3. ORG DETAIL TESTS
// ==========================================

test("Org detail returns org details, signers, and archives", async (baseUrl) => {
  await resetDb(baseUrl)
  const org = await getOrganizationBySlug("fiveonefour")
  assert(org !== undefined, "org found")
  assertEqual(org.name, "Fiveonefour", "org name")
  assertEqual(org.isActive, true, "org is active")
  assert(org.claText.includes("Contributor License Agreement"), "CLA content present")
  assert(typeof org.claTextSha256 === "string", "claTextSha256 is a string")
  assert(org.claTextSha256.length === 64, "sha256 is 64 hex chars")
  const signers = await getSignaturesByOrg(org.id)
  assertEqual(signers.length, 3, "fiveonefour signers count")
  const uniqueSignerCount = new Set(signers.map((s) => s.userId)).size
  assertEqual(uniqueSignerCount, signers.length, "signers are deduplicated by user")
  const archives = await getArchivesByOrg(org.id)
  assert(archives.length >= 1, "at least 1 archive exists")
  const archiveSignerCounts = await getSignerCountsByClaSha(org.id)
  assert(typeof archiveSignerCounts === "object", "archiveSignerCounts object is present")
  assert(
    typeof archiveSignerCounts[org.claTextSha256] === "number",
    "archiveSignerCounts contains current CLA count"
  )
})

test("Org detail returns undefined for nonexistent org", async (baseUrl) => {
  await resetDb(baseUrl)
  const org = await getOrganizationBySlug("nonexistent")
  assert(org === undefined, "org not found")
})

// ==========================================
// 4. CLA EDITING & VERSIONING TESTS
// ==========================================

test("Internal CLA mutation updates CLA text and sha256", async (baseUrl) => {
  await resetDb(baseUrl)
  const orgBefore = await getOrganizationBySlug("fiveonefour")
  assert(orgBefore !== undefined, "org found before update")
  const oldSha256 = orgBefore.claTextSha256

  const newCla = "# Updated CLA\n\nNew agreement text here."
  const updatedRow = await updateClaForOrg("fiveonefour", newCla)
  assertEqual(updatedRow.claText, newCla, "org has updated CLA text")
  assert(updatedRow.claTextSha256 !== oldSha256, "sha256 changed after edit")

  // Verify persisted
  const orgAfter = await getOrganizationBySlug("fiveonefour")
  assert(orgAfter !== undefined, "org found after update")
  assertEqual(orgAfter.claText, newCla, "CLA persisted")
  assertEqual(orgAfter.claTextSha256, updatedRow.claTextSha256, "sha256 persisted")
})

test("Multiple CLA edits only update sha256 (no archive until signing)", async (baseUrl) => {
  await resetDb(baseUrl)
  const orgBefore = await getOrganizationBySlug("fiveonefour")
  assert(orgBefore !== undefined, "org found before updates")
  const archivesBefore = (await getArchivesByOrg(orgBefore.id)).length

  // Edit 1
  const orgV2 = await updateClaForOrg("fiveonefour", "# V2 CLA")

  // Edit 2
  const orgV3 = await updateClaForOrg("fiveonefour", "# V3 CLA")
  assert(orgV2.claTextSha256 !== orgV3.claTextSha256, "each edit produces different sha256")

  // Verify: no new archives created (only signings create archives)
  const orgAfter = await getOrganizationBySlug("fiveonefour")
  assert(orgAfter !== undefined, "org found after updates")
  const archivesAfter = (await getArchivesByOrg(orgAfter.id)).length
  assertEqual(archivesAfter, archivesBefore, "no new archives from edits alone")
  assertEqual(orgAfter.claText, "# V3 CLA", "latest CLA content")
})

// ==========================================
// 5. ACTIVATE / DEACTIVATE TESTS
// ==========================================

test("Internal org mutation can deactivate an org", async (baseUrl) => {
  await resetDb(baseUrl)
  const row = await setOrgActiveForTest("fiveonefour", false)
  assertEqual(row.isActive, false, "org deactivated")

  // Verify persists
  const org = await getOrganizationBySlug("fiveonefour")
  assert(org !== undefined, "org found")
  assertEqual(org.isActive, false, "deactivation persisted")
})

test("Internal org mutation can re-activate an org", async (baseUrl) => {
  await resetDb(baseUrl)
  // Deactivate
  await setOrgActiveForTest("fiveonefour", false)
  // Re-activate
  const row = await setOrgActiveForTest("fiveonefour", true)
  assertEqual(row.isActive, true, "org re-activated")
})

test("signClaForUser blocks signing on deactivated org", async (baseUrl) => {
  await resetDb(baseUrl)
  await setOrgActiveForTest("fiveonefour", false)
  try {
    await signCla({ orgSlug: "fiveonefour" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 403, "signing blocked on inactive org")
  }
})

// ==========================================
// 6. CLA SIGNING FLOW TESTS
// ==========================================

test("getSignatureStatus shows already signed for contributor", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const status = await getSignatureStatus("fiveonefour", TEST_USERS.contributor.id)
  assertEqual(status.signed, true, "already signed")
  assertEqual(status.currentVersion, true, "current version")
  assert(status.signature !== null, "signature exists")
})

test("getSignatureStatus shows not signed for admin", async (baseUrl) => {
  await resetDb(baseUrl)
  const status = await getSignatureStatus("fiveonefour", TEST_USERS.admin.id)
  assertEqual(status.signed, false, "admin hasn't signed")
  assert(status.signature === null, "no signature")
})

test("signClaForUser creates a new signature", async (baseUrl) => {
  await resetDb(baseUrl)
  const result = await signCla({ orgSlug: "fiveonefour" })
  assert(result.signature !== undefined, "signature returned")
  assertEqual(result.signature.githubUsername, "orgadmin", "signer username")
  assertEqual(
    result.signature.emailAtSignature,
    "orgadmin@fiveonefour.com",
    "signature email at sign time"
  )

  // Verify persisted
  const status = await getSignatureStatus("fiveonefour", TEST_USERS.admin.id)
  assertEqual(status.signed, true, "now signed")
})

test("signClaForUser prevents duplicate signatures", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  try {
    await signCla({ orgSlug: "fiveonefour" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 409, "duplicate rejected")
  }
})

test("signClaForUser rejects stale acceptedSha256", async (baseUrl) => {
  await resetDb(baseUrl)
  try {
    await signCla({ orgSlug: "fiveonefour", acceptedSha256: "deadbeef" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 409, "stale hash rejected")
  }
})

test("signClaForUser rejects missing orgSlug", async (baseUrl) => {
  await resetDb(baseUrl)
  try {
    await signCla({ orgSlug: "" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 400, "missing orgSlug rejected")
  }
})

test("signClaForUser rejects repoName without prNumber", async (baseUrl) => {
  await resetDb(baseUrl)
  try {
    await signCla({ orgSlug: "fiveonefour", repoName: "sdk" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 400, "repoName without prNumber rejected")
  }
})

test("signClaForUser rejects prNumber without repoName", async (baseUrl) => {
  await resetDb(baseUrl)
  try {
    await signCla({ orgSlug: "fiveonefour", prNumber: 12 })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 400, "prNumber without repoName rejected")
  }
})

test("signClaForUser returns NOT_FOUND for nonexistent org", async (baseUrl) => {
  await resetDb(baseUrl)
  try {
    await signCla({ orgSlug: "does-not-exist" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 404, "nonexistent org returns 404")
  }
})

test("getOrganizationBySlug returns undefined for nonexistent org", async (baseUrl) => {
  await resetDb(baseUrl)
  const org = await getOrganizationBySlug("nonexistent")
  assert(org === undefined, "nonexistent org returns undefined")
})

// ==========================================
// 7. RE-SIGN AFTER CLA UPDATE TESTS
// ==========================================

test("CLA update invalidates existing signatures (needs re-sign)", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Contributor has signed the current CLA
  await switchRole(baseUrl, "contributor")
  const status1 = await getSignatureStatus("fiveonefour", TEST_USERS.contributor.id)
  assertEqual(status1.signed, true, "contributor signed current CLA")
  assertEqual(status1.currentVersion, true, "no re-sign needed yet")
  const originalSha256 = status1.currentSha256

  // Step 2: Admin updates the CLA text (changes sha256)
  await switchRole(baseUrl, "admin")
  const updatedOrg = await updateClaForOrg("fiveonefour", "# Updated CLA v2\n\nNew terms.")
  assert(updatedOrg.claTextSha256 !== originalSha256, "sha256 changed after edit")

  // Step 3: Contributor now needs to re-sign
  await switchRole(baseUrl, "contributor")
  const status2 = await getSignatureStatus("fiveonefour", TEST_USERS.contributor.id)
  assertEqual(status2.signed, true, "signed, but for old version")
  assertEqual(status2.currentVersion, false, "re-sign required")
  assert(status2.signature !== null, "old signature returned")
  assert(
    status2.signature?.claSha256 !== status2.currentSha256,
    "signed sha256 differs from current"
  )
})

test("Contributor can re-sign after CLA update", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin updates CLA
  await switchRole(baseUrl, "admin")
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  // Step 2: Contributor re-signs
  await switchRole(baseUrl, "contributor")
  const result = await signCla({ orgSlug: "fiveonefour", repoName: "sdk", prNumber: 20 })
  assert(result.signature !== undefined, "new signature returned")

  // Step 3: Verify contributor is now on current version
  const status = await getSignatureStatus("fiveonefour", TEST_USERS.contributor.id)
  assertEqual(status.signed, true, "now signed current version")
  assertEqual(status.currentVersion, true, "no re-sign needed")
})

test("Admin signers list shows outdated badges after CLA update", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Check initial state -- all 3 signers on current sha256
  const org1 = await getOrganizationBySlug("fiveonefour")
  assert(org1 !== undefined, "org found")
  const signers1 = await getSignaturesByOrg(org1.id)
  assertEqual(signers1.length, 3, "3 signers initially")
  const allOnCurrent = signers1.every((s) => s.claSha256 === org1.claTextSha256)
  assert(allOnCurrent, "all signers on current version initially")

  // Step 2: Admin updates CLA
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  // Step 3: All signers are now outdated (their sha256 != new sha256)
  const org2 = await getOrganizationBySlug("fiveonefour")
  assert(org2 !== undefined, "org found after update")
  const signers2 = await getSignaturesByOrg(org2.id)
  assertEqual(signers2.length, 3, "still 3 signers")
  const noneOnCurrent = signers2.every((s) => s.claSha256 !== org2.claTextSha256)
  assert(noneOnCurrent, "all signers now on outdated version")
})

test("Admin signers list keeps one latest row per user after re-sign", async (baseUrl) => {
  await resetDb(baseUrl)

  await switchRole(baseUrl, "admin")
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  await switchRole(baseUrl, "contributor")
  const result = await signCla({ orgSlug: "fiveonefour" })
  const signerUserId = result.signature.userId
  assert(typeof signerUserId === "string", "resigned user id is present")

  await switchRole(baseUrl, "admin")
  const org = await getOrganizationBySlug("fiveonefour")
  assert(org !== undefined, "org found")
  const signers = await getSignaturesByOrg(org.id)

  const userRows = signers.filter((s) => s.userId === signerUserId)
  assertEqual(userRows.length, 1, "user appears only once in signers")
  assertEqual(userRows[0].claSha256, org.claTextSha256, "user row points to latest CLA")
})

test("Contributor dashboard shows re-sign required after CLA update", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin updates CLA
  await switchRole(baseUrl, "admin")
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  // Step 2: Contributor checks their dashboard
  await switchRole(baseUrl, "contributor")
  const { signatures } = await getContributorData(TEST_USERS.contributor.id)
  const fiveOneFourSig = signatures.find((s) => s.orgSlug === "fiveonefour")
  assert(fiveOneFourSig !== undefined, "fiveonefour signature exists")
  assertEqual(fiveOneFourSig.isCurrentVersion, false, "signature is outdated")
  assert(typeof fiveOneFourSig.signedVersionLabel === "string", "signedVersionLabel is a string")
  assertEqual(
    fiveOneFourSig.signedVersionLabel.length,
    7,
    "signedVersionLabel is 7-char sha256 prefix"
  )
})

// ==========================================
// 8. CONTRIBUTOR DASHBOARD TESTS
// ==========================================

test("Contributor dashboard returns signed CLAs for contributor", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const data = await getContributorData(TEST_USERS.contributor.id)
  assertEqual(data.user.githubUsername, "contributor1", "user")
  assertEqual(data.signatures.length, 2, "signature count")
  assert(
    data.signatures.some((s) => s.orgSlug === "fiveonefour"),
    "fiveonefour CLA present"
  )
  assert(
    data.signatures.some((s) => s.orgSlug === "moose-stack"),
    "moose-stack CLA present"
  )
  assertEqual(data.signedOrgCount, 2, "signed org count")
  assertEqual(data.outdatedOrgCount, 0, "outdated org count")
})

test("Contributor dashboard returns empty for admin (no signatures)", async (baseUrl) => {
  await resetDb(baseUrl)
  const data = await getContributorData(TEST_USERS.admin.id)
  assertEqual(data.signatures.length, 0, "admin has no signatures")
  assertEqual(data.signedOrgCount, 0, "signed org count")
  assertEqual(data.outdatedOrgCount, 0, "outdated org count")
})

test("Contributor dashboard tracks latest signature status per org after re-sign", async (baseUrl) => {
  await resetDb(baseUrl)

  await switchRole(baseUrl, "contributor")
  const beforeData = await getContributorData(TEST_USERS.contributor.id)
  assertEqual(beforeData.outdatedOrgCount, 0, "no outdated orgs initially")

  await switchRole(baseUrl, "admin")
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  await switchRole(baseUrl, "contributor")
  const outdatedData = await getContributorData(TEST_USERS.contributor.id)
  assertEqual(outdatedData.outdatedOrgCount, 1, "org becomes outdated after CLA change")

  await signCla({ orgSlug: "fiveonefour" })

  const afterData = await getContributorData(TEST_USERS.contributor.id)
  assertEqual(afterData.outdatedOrgCount, 0, "org no longer outdated after re-sign")

  const latestFiveOneFour = afterData.signatures.find(
    (s) => s.orgSlug === "fiveonefour" && s.isLatestForOrg
  )
  assert(latestFiveOneFour !== undefined, "latest fiveonefour signature exists")
  assertEqual(latestFiveOneFour.orgNeedsResign, false, "latest signature is compliant")
})

test("Contributor can download their signed CLA history entry", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")

  const { signatures } = await getContributorData(TEST_USERS.contributor.id)
  const signatureId = signatures[0]?.id
  assert(typeof signatureId === "string", "signature id available")

  const downloadRes = await fetch(`${baseUrl}/api/contributor/signatures/${signatureId}/download`)
  const markdown = await downloadRes.text()
  assertEqual(downloadRes.status, 200, "download status")
  assert(
    (downloadRes.headers.get("content-type") ?? "").startsWith("text/markdown"),
    "markdown content-type"
  )
  assert(
    (downloadRes.headers.get("content-disposition") ?? "").includes("attachment"),
    "attachment disposition"
  )
  assert(markdown.includes("Contributor License Agreement"), "markdown body returned")
})

test("Contributor can view a historical signed CLA version inline", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")

  await updateClaForOrg("fiveonefour", "# History View v1")
  await signCla({ orgSlug: "fiveonefour" })

  await updateClaForOrg("fiveonefour", "# History View v2")
  await signCla({ orgSlug: "fiveonefour" })

  const { signatures } = await getContributorData(TEST_USERS.contributor.id)
  const historySignature = signatures.find((s) => s.orgSlug === "fiveonefour" && !s.isLatestForOrg)
  assert(historySignature !== undefined, "historical signature exists")

  const viewRes = await fetch(
    `${baseUrl}/api/contributor/signatures/${historySignature.id}/download?disposition=inline`
  )
  const markdown = await viewRes.text()
  assertEqual(viewRes.status, 200, "inline view status")
  assert(
    (viewRes.headers.get("content-disposition") ?? "").startsWith("inline"),
    "inline content disposition"
  )
  assert(markdown.includes("History View v1"), "historical CLA text returned")
  assert(!markdown.includes("History View v2"), "latest CLA text not returned")
})

test("Contributor CLA download endpoint denies access to another user's signature", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const { signatures } = await getContributorData(TEST_USERS.contributor.id)
  const signatureId = signatures[0]?.id
  assert(typeof signatureId === "string", "signature id available")

  await switchRole(baseUrl, "admin")
  const deniedRes = await fetch(`${baseUrl}/api/contributor/signatures/${signatureId}/download`)
  assertEqual(deniedRes.status, 404, "cannot download another user's signature")
})

// ==========================================
// 9. FULL END-TO-END FLOWS
// ==========================================

test("Full flow: sign, update CLA, verify outdated, re-sign", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin signs fiveonefour CLA (v1)
  await signCla({ orgSlug: "fiveonefour" })

  // Step 2: Verify admin signed v1
  const status1 = await getSignatureStatus("fiveonefour", TEST_USERS.admin.id)
  assertEqual(status1.signed, true, "admin signed")
  assertEqual(status1.currentVersion, true, "no re-sign needed")

  // Step 3: Admin updates CLA to v2
  await updateClaForOrg("fiveonefour", "# Completely new CLA v2")

  // Step 4: Admin now needs to re-sign (their v1 signature is outdated)
  const status2 = await getSignatureStatus("fiveonefour", TEST_USERS.admin.id)
  assertEqual(status2.signed, true, "signed, but old version")
  assertEqual(status2.currentVersion, false, "re-sign needed")

  // Step 5: Admin re-signs
  await signCla({ orgSlug: "fiveonefour" })

  // Step 6: Verify admin is now on current version
  const status3 = await getSignatureStatus("fiveonefour", TEST_USERS.admin.id)
  assertEqual(status3.signed, true, "admin now signed v2")
  assertEqual(status3.currentVersion, true, "no re-sign needed")

  // Step 7: Verify signers list -- admin should appear with current version
  const org = await getOrganizationBySlug("fiveonefour")
  assert(org !== undefined, "org found")
  const signers = await getSignaturesByOrg(org.id)
  // Signers are deduplicated by user; admin should appear once and on latest version.
  assert(signers.length >= 4, "unique signer count includes admin")
  const uniqueUserCount = new Set(signers.map((s) => s.userId)).size
  assertEqual(uniqueUserCount, signers.length, "signers are deduplicated")
  // At least one signer on current sha256 (admin's re-sign)
  const currentSigners = signers.filter((s) => s.claSha256 === org.claTextSha256)
  assert(currentSigners.length >= 1, "at least 1 signer on current version")
})

test("Full flow: CLA edit visible on sign page", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin edits CLA
  const newCla = "# Custom CLA\n\nThis is a totally custom agreement."
  await updateClaForOrg("fiveonefour", newCla)

  // Step 2: Contributor sees updated CLA via org query
  await switchRole(baseUrl, "contributor")
  const org = await getOrganizationBySlug("fiveonefour")
  assert(org !== undefined, "org found")
  assertEqual(org.claText, newCla, "CLA is updated on sign page")
})

test("Full flow: role switching maintains separate data views", async (baseUrl) => {
  await resetDb(baseUrl)

  // As admin, see 2 orgs
  const allOrgs = await getOrganizations()
  const adminOrgs = await filterInstalledOrganizationsForAdmin(TEST_USERS.admin, allOrgs)
  assertEqual(adminOrgs.length, 2, "admin sees 2 orgs")
  assertEqual(TEST_USERS.admin.role, "admin", "user is admin")

  // Switch to contributor
  await switchRole(baseUrl, "contributor")

  // As contributor, see 0 admin orgs but 2 signed CLAs
  const allOrgs2 = await getOrganizations()
  const contribOrgs = await filterInstalledOrganizationsForAdmin(TEST_USERS.contributor, allOrgs2)
  assertEqual(contribOrgs.length, 0, "contributor sees 0 admin orgs")

  const contribData = await getContributorData(TEST_USERS.contributor.id)
  assertEqual(contribData.signatures.length, 2, "contributor has 2 signed CLAs")
  assertEqual(contribData.user.role, "contributor", "user is contributor")

  // Switch back to admin
  await switchRole(baseUrl, "admin")

  const allOrgs3 = await getOrganizations()
  const adminOrgs2 = await filterInstalledOrganizationsForAdmin(TEST_USERS.admin, allOrgs3)
  assertEqual(adminOrgs2.length, 2, "admin sees orgs again")
})

test("Full flow: deactivate org blocks signing, reactivate allows it", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Deactivate
  await setOrgActiveForTest("fiveonefour", false)

  // Step 2: Signing blocked
  try {
    await signCla({ orgSlug: "fiveonefour" })
    assert(false, "should have thrown SignClaError")
  } catch (e) {
    assert(e instanceof SignClaError, "SignClaError thrown")
    assertEqual(e.status, 403, "signing blocked when inactive")
  }

  // Step 3: Reactivate
  await setOrgActiveForTest("fiveonefour", true)

  // Step 4: Signing allowed again
  const result = await signCla({ orgSlug: "fiveonefour" })
  assert(result.signature !== undefined, "signing allowed when reactivated")
})

// ==========================================
// 10. DATABASE RESET TEST
// ==========================================

test("Reset helper restores initial state", async (baseUrl) => {
  // Mutate data
  await updateClaForOrg("fiveonefour", "MUTATED")

  // Reset
  await resetDb(baseUrl)

  // Verify restored
  const org = await getOrganizationBySlug("fiveonefour")
  assert(org !== undefined, "org found after reset")
  assert(org.claText.includes("Contributor License Agreement"), "CLA restored to original")
  assertEqual(org.isActive, true, "active state restored")
  const signers = await getSignaturesByOrg(org.id)
  assertEqual(signers.length, 3, "signers restored")
  const archives = await getArchivesByOrg(org.id)
  assertEqual(archives.length, 1, "archives restored to 1")
})

// ==========================================
// 11. WEBHOOK / PR CHECK TESTS
// ==========================================

async function sendWebhook(baseUrl: string, event: string, payload: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/webhook/github`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-github-event": event,
    },
    body: JSON.stringify(payload),
  })
  return { res, data: await res.json() }
}

function makePrPayload(opts: {
  action: string
  prAuthor: string
  prAuthorId?: number
  orgSlug: string
  repoName: string
  prNumber: number
}) {
  return {
    action: opts.action,
    number: opts.prNumber,
    pull_request: {
      user: {
        login: opts.prAuthor,
        ...(typeof opts.prAuthorId === "number" ? { id: opts.prAuthorId } : {}),
      },
      head: { sha: `test-sha-${Date.now()}` },
    },
    repository: {
      name: opts.repoName,
      owner: { login: opts.orgSlug },
    },
  }
}

// -- Scenario 1: Org member -> green check, NO comment --
// orgadmin is listed in the mock GitHub client's org memberships

test("Webhook: org member opens PR -> green check, no comment", async (baseUrl) => {
  await resetDb(baseUrl)
  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "orgadmin",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 1,
    })
  )
  assertEqual(data.check.status, "success", "check passes for org member")
  assertEqual(data.orgMember, true, "flagged as org member")
  assertEqual(data.comment, null, "no comment posted for org member")
})

test("Webhook: personal account owner opens PR -> green check, no comment", async (baseUrl) => {
  await resetDb(baseUrl)

  await sendWebhook(baseUrl, "installation", {
    action: "created",
    installation: {
      id: 22001,
      account: { login: "orgadmin", id: 1001, type: "User" },
    },
    sender: { id: 1001, login: "orgadmin" },
  })

  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "orgadmin",
      prAuthorId: 1001,
      orgSlug: "orgadmin",
      repoName: "personal-repo",
      prNumber: 101,
    })
  )
  assertEqual(data.check.status, "success", "check passes for personal account owner")
  assertEqual(data.accountOwner, true, "flagged as account owner")
  assertEqual(data.comment, null, "no comment posted for account owner")
})

test("Webhook: bypassed user opens PR -> green check, no CLA comment", async (baseUrl) => {
  await resetDb(baseUrl)
  await addBypassAccountForOrg({
    orgSlug: "fiveonefour",
    githubUserId: "1004",
    githubUsername: "new-contributor",
  })

  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 102,
    })
  )
  assertEqual(data.check.status, "success", "check passes for bypassed user")
  assertEqual(data.bypassed, true, "response flags bypass")
  assertEqual(data.comment, null, "no CLA comment posted for bypassed user")
})

test("Webhook: bypassed app bot opens PR -> green check, no CLA comment", async (baseUrl) => {
  await resetDb(baseUrl)
  await addBypassAccountForOrg({
    orgSlug: "fiveonefour",
    bypassKind: "app_bot",
    actorSlug: "dependabot",
    githubUsername: "dependabot[bot]",
  })

  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "dependabot[bot]",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 112,
    })
  )
  assertEqual(data.check.status, "success", "check passes for bypassed app bot")
  assertEqual(data.bypassed, true, "response flags bypass")
  assertEqual(data.comment, null, "no CLA comment posted for bypassed app bot")
})

test("Webhook: adding bypass then /recheck removes stale CLA comment", async (baseUrl) => {
  await resetDb(baseUrl)

  const { data: initialData } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 103,
    })
  )
  assertEqual(initialData.check.status, "failure", "initial check fails before bypass")
  assert(initialData.comment?.id, "initial CLA comment exists")

  await addBypassAccountForOrg({
    orgSlug: "fiveonefour",
    githubUserId: "1004",
    githubUsername: "new-contributor",
  })

  const { data: recheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 103,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/103" },
    },
    repository: { owner: { login: "fiveonefour" }, name: "sdk" },
    installation: { id: 10001 },
  })
  assertEqual(recheckData.check.status, "success", "recheck passes after bypass")
  assertEqual(recheckData.bypassed, true, "recheck response flags bypass")

  const getRes = await fetch(
    `${baseUrl}/api/webhook/github?orgSlug=fiveonefour&repoName=sdk&prNumber=103`
  )
  const getData = await getRes.json()
  assertEqual(getData.comment, null, "stale CLA comment removed after bypass recheck")
})

test("Webhook: removing bypass restores CLA enforcement on /recheck", async (baseUrl) => {
  await resetDb(baseUrl)
  await addBypassAccountForOrg({
    orgSlug: "fiveonefour",
    githubUserId: "1004",
    githubUsername: "new-contributor",
  })

  await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 104,
    })
  )

  await removeBypassAccountForOrg({
    orgSlug: "fiveonefour",
    githubUserId: "1004",
  })

  const { data: recheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 104,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/104" },
    },
    repository: { owner: { login: "fiveonefour" }, name: "sdk" },
    installation: { id: 10001 },
  })
  assertEqual(recheckData.check.status, "failure", "recheck fails after bypass removal")
  assertEqual(recheckData.bypassed, undefined, "no bypass flag once removed")
  assert(
    typeof recheckData.comment?.commentMarkdown === "string" &&
      recheckData.comment.commentMarkdown.includes("Contributor License Agreement Required"),
    "CLA required comment restored after bypass removal"
  )
})

// -- Scenario 2: Non-member, never signed ANY version -> red check + unsigned comment --
// "new-contributor" exists in the mock GitHub user pool but has NEVER signed
// any CLA and does NOT exist in the app's user DB.

test("Webhook: truly unsigned non-member gets failing check + CLA comment", async (baseUrl) => {
  await resetDb(baseUrl)

  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 2,
    })
  )
  assertEqual(data.check.status, "failure", "check fails")
  assertEqual(data.signed, false, "not signed")
  assertEqual(data.needsResign, false, "needsResign is false -- never signed at all")
  assert(data.comment !== null, "comment was posted")
  assert(
    data.comment.commentMarkdown.includes("Contributor License Agreement Required"),
    "comment has 'CLA Required' header (not re-sign)"
  )
  assert(data.comment.commentMarkdown.includes("Sign the CLA"), "comment has sign CTA")
  assert(data.comment.commentMarkdown.includes("utm_source=github"), "comment has UTM tracking")
  assert(data.comment.commentMarkdown.includes("fiveonefour.com"), "comment has branding")
})

// -- Scenario 2b: After signing, async PR sync is scheduled --

test("Webhook: after signing, schedules async signer PR sync", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Update CLA to v2 so contributor1's existing v1 sig is stale
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  // Step 2: contributor1 opens PR -> fails (stale sig)
  const { data: prData } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 20,
    })
  )
  assertEqual(prData.check.status, "failure", "initially fails")

  // Step 3: Switch to contributor role and sign the CLA
  await switchRole(baseUrl, "contributor")
  const signData = await signCla({ orgSlug: "fiveonefour", repoName: "sdk", prNumber: 20 })

  // Step 4: Verify async sync scheduling metadata is returned.
  assertEqual(signData.prSyncScheduled, true, "sign schedules async PR sync")
  assert(typeof signData.prSyncRunId === "string", "workflow run id returned")
  assertEqual(signData.prSyncScheduleError, null, "no scheduling error")
})

test("Webhook: signing without repo/pr still schedules async open PR sync", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: contributor1 opens PR while signed current -> success
  await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 77,
    })
  )

  // Step 2: CLA update makes signature stale, /recheck forces failure + prompt comment.
  await updateClaForOrg("fiveonefour", "# Updated CLA v2 for global sign sync")
  const { data: recheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 77,
      user: { login: "contributor1", id: 1002 },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/77" },
    },
    repository: { owner: { login: "fiveonefour" }, name: "sdk" },
    installation: { id: 11111 },
  })
  assertEqual(recheckData.check.status, "failure", "recheck fails after CLA update")
  assert(recheckData.comment?.id, "stale comment is present before signing")

  // Step 3: Sign WITHOUT repo/pr context.
  await switchRole(baseUrl, "contributor")
  const signData = await signCla({ orgSlug: "fiveonefour" })
  assertEqual(signData.prSyncScheduled, true, "sign schedules async sync without repo/pr")
  assert(typeof signData.prSyncRunId === "string", "workflow run id returned")
  assertEqual(signData.prSyncScheduleError, null, "no scheduling error")
})

// -- Scenario 3: Non-member, signed old version -> red check + re-sign comment --

test("Webhook: CLA updated -> contributor needs re-sign -> failing check", async (baseUrl) => {
  await resetDb(baseUrl)

  // Update CLA (creates v2, invalidates contributor1's v1 signature)
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 3,
    })
  )
  assertEqual(data.check.status, "failure", "check should fail")
  assertEqual(data.signed, false, "not signed for current version")
  assertEqual(data.needsResign, true, "needs re-sign flag set")
  assert(data.comment.commentMarkdown.includes("Re-signing Required"), "comment has re-sign header")
  // Comment now shows a 7-char sha256 prefix as the version label
  assert(data.comment.commentMarkdown.includes("version"), "comment mentions version label")
})

test("Webhook: re-sign flow -- sign schedules async check/comment sync", async (baseUrl) => {
  await resetDb(baseUrl)

  // Update CLA to v2
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  // PR opened with stale signature -> fails
  const { data: prData } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 30,
    })
  )
  assertEqual(prData.check.status, "failure", "initially fails")
  assertEqual(prData.needsResign, true, "needs re-sign")

  // Contributor re-signs
  await switchRole(baseUrl, "contributor")
  const signData = await signCla({ orgSlug: "fiveonefour", repoName: "sdk", prNumber: 30 })
  assertEqual(signData.prSyncScheduled, true, "re-sign schedules async sync")
  assert(typeof signData.prSyncRunId === "string", "workflow run id returned")
  assertEqual(signData.prSyncScheduleError, null, "no scheduling error")
})

// -- Scenario 4: Non-member, signed latest version -> green check, NO comment --

test("Webhook: non-member with current signature -> green check, no comment", async (baseUrl) => {
  await resetDb(baseUrl)
  // contributor1 has a valid v1 signature for fiveonefour (which IS the current version)
  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 4,
    })
  )
  assertEqual(data.check.status, "success", "check passes")
  assertEqual(data.signed, true, "signed flag is true")
  assertEqual(data.comment, null, "no comment posted when already signed")
})

test("Webhook: CLA update can recheck open PR and fail until contributor re-signs", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: contributor1 opens a PR while signed on current CLA -> success check
  const { data: openedData } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 44,
    })
  )
  assertEqual(openedData.check.status, "success", "initial check passes")
  assertEqual(openedData.comment, null, "no initial comment while current")

  // Step 2: admin updates CLA to a new version (contributor1 signature becomes outdated)
  await updateClaForOrg("fiveonefour", "# Updated CLA v2")

  // Step 3: /recheck on the same open PR should fail and post/update the re-sign comment
  const { res: recheckRes, data: recheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "contributor1" } },
    issue: {
      number: 44,
      user: { login: "contributor1" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/44" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })

  assertEqual(recheckRes.status, 200, "recheck accepted")
  assertEqual(recheckData.check.status, "failure", "recheck now fails on outdated signature")
  assertEqual(recheckData.needsResign, true, "recheck marks contributor as needing re-sign")
  assert(
    recheckData.comment.commentMarkdown.includes("Re-signing Required"),
    "re-sign comment posted"
  )
})

test("CLA update + /recheck command fails outdated contributors on open PRs", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: contributor1 opens PR while still compliant -> passing check
  const { data: openedData } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 66,
    })
  )
  assertEqual(openedData.check.status, "success", "initial check passes")

  // Step 2: admin updates CLA, making the existing signature outdated
  await updateClaForOrg("fiveonefour", "# Updated CLA v2 for proactive recheck")

  // Step 3: /recheck on the same PR should now fail and post/update a re-sign comment
  const { res: recheckRes, data: recheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 66,
      user: { login: "contributor1" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/66" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(recheckRes.status, 200, "recheck accepted")
  assertEqual(recheckData.check.status, "failure", "recheck fails on outdated signature")
  assertEqual(recheckData.needsResign, true, "recheck marks contributor as needing re-sign")

  // Step 4: bot comment is updated/created with re-sign guidance
  const commentRes = await fetch(
    `${baseUrl}/api/webhook/github?orgSlug=fiveonefour&repoName=sdk&prNumber=66`
  )
  const commentData = await commentRes.json()
  assert(commentData.comment !== null, "comment exists after /recheck")
  assert(
    commentData.comment.commentMarkdown.includes("Re-signing Required"),
    "comment prompts re-signing"
  )
})

// -- Scenario 5: Bot deactivated -> green check, NO comment --

test("Webhook: inactive org -> green check, no comment, not blocking", async (baseUrl) => {
  await resetDb(baseUrl)

  // Deactivate org
  await setOrgActiveForTest("fiveonefour", false)

  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "contributor1",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 5,
    })
  )
  assertEqual(data.skipped, true, "skipped flag is true")
  assertEqual(data.check.status, "success", "check run created as success while deactivated")
  assertEqual(data.comment, null, "no comment posted")
  assertEqual(data.inactive, true, "inactive flag returned")
})

test("Deactivate + reactivate converges PR checks on /recheck", async (baseUrl) => {
  await resetDb(baseUrl)

  await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 51,
    })
  )

  const beforeDeactivateRes = await fetch(
    `${baseUrl}/api/webhook/github?orgSlug=fiveonefour&repoName=sdk&prNumber=51`
  )
  const beforeDeactivateData = await beforeDeactivateRes.json()
  assert(beforeDeactivateData.comment !== null, "unsigned PR has initial CLA prompt comment")

  await setOrgActiveForTest("fiveonefour", false)
  const { data: inactiveRecheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 51,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/51" },
    },
    repository: { owner: { login: "fiveonefour" }, name: "sdk" },
    installation: { id: 10001 },
  })
  assertEqual(
    inactiveRecheckData.check.status,
    "success",
    "inactive /recheck marks PR checks as success"
  )

  const afterDeactivateRes = await fetch(
    `${baseUrl}/api/webhook/github?orgSlug=fiveonefour&repoName=sdk&prNumber=51`
  )
  const afterDeactivateData = await afterDeactivateRes.json()
  assertEqual(afterDeactivateData.comment, null, "CLA prompt comment removed after deactivate run")

  await setOrgActiveForTest("fiveonefour", true)
  const { data: activeRecheckData } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 51,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/51" },
    },
    repository: { owner: { login: "fiveonefour" }, name: "sdk" },
    installation: { id: 10001 },
  })
  assertEqual(
    activeRecheckData.check.status,
    "failure",
    "active /recheck restores CLA enforcement failure"
  )

  const afterReactivateRes = await fetch(
    `${baseUrl}/api/webhook/github?orgSlug=fiveonefour&repoName=sdk&prNumber=51`
  )
  const afterReactivateData = await afterReactivateRes.json()
  assert(
    afterReactivateData.comment !== null,
    "CLA prompt comment restored after re-activation run"
  )
})

// -- Additional webhook tests --

test("Webhook: unknown org returns 404", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "someone",
      orgSlug: "nonexistent-org",
      repoName: "repo",
      prNumber: 6,
    })
  )
  assertEqual(res.status, 404, "404 for unknown org")
})

test("Webhook: /recheck allows org member requester", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 7,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/7" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(res.status, 200, "request accepted")
  assert(data.check !== undefined, "check was evaluated")
})

test("Webhook: /recheck allows PR author requester", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "new-contributor" } },
    issue: {
      number: 8,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/8" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(res.status, 200, "request accepted")
  assert(data.check !== undefined, "check was evaluated")
})

test("Webhook: /recheck allows personal account owner requester", async (baseUrl) => {
  await resetDb(baseUrl)

  await sendWebhook(baseUrl, "installation", {
    action: "created",
    installation: {
      id: 22002,
      account: { login: "orgadmin", id: 1001, type: "User" },
    },
    sender: { id: 1001, login: "orgadmin" },
  })

  const { res, data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 81,
      user: { login: "new-contributor", id: 1004 },
      pull_request: { url: "https://api.github.com/repos/orgadmin/personal-repo/pulls/81" },
    },
    repository: { name: "personal-repo", owner: { login: "orgadmin" } },
    installation: { id: 22002 },
  })
  assertEqual(res.status, 200, "request accepted")
  assert(data.check !== undefined, "check was evaluated")
})

test("Webhook: /recheck allows maintainer requester", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "dev-sarah" } },
    issue: {
      number: 9,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/9" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(res.status, 200, "request accepted")
  assert(data.check !== undefined, "check was evaluated")
})

test("Webhook: /recheck rejects unauthorized requester", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "random-dev" } },
    issue: {
      number: 10,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/10" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(res.status, 403, "unauthorized requester is blocked")
})

test("Webhook: /recheck on non-PR issue is ignored", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck", user: { login: "orgadmin" } },
    issue: {
      number: 11,
      user: { login: "new-contributor" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(res.status, 200, "request handled")
  assertEqual(data.message, "Ignored /recheck on non-PR issue", "ignored response")
})

test("Webhook: non-/recheck issue comment is ignored", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "looks good to me", user: { login: "orgadmin" } },
    issue: {
      number: 12,
      user: { login: "new-contributor" },
      pull_request: { url: "https://api.github.com/repos/fiveonefour/sdk/pulls/12" },
    },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(res.status, 200, "request handled")
  assertEqual(data.message, "Not a /recheck command", "ignored response")
})

test("Webhook: missing pull_request payload fields returns 400", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "pull_request", {
    action: "opened",
    number: 13,
    pull_request: {
      user: { login: "new-contributor" },
      // missing head.sha
    },
    repository: {
      name: "sdk",
      owner: { login: "fiveonefour" },
    },
  })
  assertEqual(res.status, 400, "bad payload rejected")
  assertEqual(data.error, "Missing required pull_request payload fields", "error message")
})

test("Webhook: installation created registers new org", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "installation", {
    action: "created",
    installation: { account: { login: "new-org" } },
    sender: { id: 1001, login: "orgadmin" },
  })
  assertEqual(res.status, 200, "status")
  assert(data.message.includes("new-org"), "message references org")
  assert(data.org !== undefined, "org object returned")
  assertEqual(data.org.claText, "", "no built-in CLA text")
  assertEqual(data.org.claTextSha256, null, "no built-in CLA hash")

  const newOrg = await getOrganizationBySlug("new-org")
  assert(newOrg !== undefined, "new org accessible")
  assertEqual(newOrg.claText, "", "org details expose empty CLA")
  assertEqual(newOrg.claTextSha256, null, "org details expose null CLA hash")
})

test("Webhook: non-member PR on org without configured CLA fails with config required", async (baseUrl) => {
  await resetDb(baseUrl)
  await sendWebhook(baseUrl, "installation", {
    action: "created",
    installation: {
      id: 33001,
      account: { login: "new-org", id: 3301, type: "Organization" },
    },
    sender: { id: 1001, login: "orgadmin" },
  })

  const { res, data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "new-org",
      repoName: "starter-kit",
      prNumber: 7,
    })
  )
  assertEqual(res.status, 200, "status")
  assertEqual(data.check.status, "failure", "check fails")
  assertEqual(data.configRequired, true, "config required flag set")
  assert(data.comment !== null, "bot comment posted")
  assert(data.comment.commentMarkdown.includes("not published"), "comment explains missing CLA")
})

test("Webhook: personal-account installation stores user target metadata", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res } = await sendWebhook(baseUrl, "installation", {
    action: "created",
    installation: {
      id: 22003,
      account: { login: "orgadmin", id: 1001, type: "User" },
    },
    sender: { id: 1001, login: "orgadmin" },
  })
  assertEqual(res.status, 200, "installation accepted")

  const orgadminOrg = await getOrganizationBySlug("orgadmin")
  assert(orgadminOrg !== undefined, "personal account row is accessible")
  assertEqual(orgadminOrg.githubAccountType, "user", "account type persisted")
  assertEqual(orgadminOrg.githubAccountId, "1001", "account id persisted")

  const allOrgs = await getOrganizations()
  const adminOrgs = await filterInstalledOrganizationsForAdmin(TEST_USERS.admin, allOrgs)
  assert(
    adminOrgs.some((org) => org.githubOrgSlug === "orgadmin"),
    "personal account appears in authorized admin org list"
  )
})

test("Webhook: installation deleted deactivates org", async (baseUrl) => {
  await resetDb(baseUrl)
  const { data } = await sendWebhook(baseUrl, "installation", {
    action: "deleted",
    installation: { account: { login: "fiveonefour" } },
  })
  assert(data.message.includes("uninstalled"), "uninstall message")

  const deactivatedOrg = await getOrganizationBySlug("fiveonefour")
  assert(deactivatedOrg !== undefined, "org found after uninstall")
  assertEqual(deactivatedOrg.isActive, false, "org deactivated after uninstall")
})

test("Webhook: installation suspend and unsuspend toggles active state", async (baseUrl) => {
  await resetDb(baseUrl)

  const { res: suspendRes } = await sendWebhook(baseUrl, "installation", {
    action: "suspend",
    installation: { account: { login: "fiveonefour" } },
  })
  assertEqual(suspendRes.status, 200, "suspend accepted")

  const orgAfterSuspend = await getOrganizationBySlug("fiveonefour")
  assert(orgAfterSuspend !== undefined, "org found after suspend")
  assertEqual(orgAfterSuspend.isActive, false, "org is inactive after suspend")

  const { res: unsuspendRes } = await sendWebhook(baseUrl, "installation", {
    action: "unsuspend",
    installation: { account: { login: "fiveonefour" } },
    sender: { id: 1, login: "orgadmin" },
  })
  assertEqual(unsuspendRes.status, 200, "unsuspend accepted")

  const orgAfterUnsuspend = await getOrganizationBySlug("fiveonefour")
  assert(orgAfterUnsuspend !== undefined, "org found after unsuspend")
  assertEqual(orgAfterUnsuspend.isActive, true, "org is active after unsuspend")
})

test("Webhook: ping event is acknowledged", async (baseUrl) => {
  await resetDb(baseUrl)
  const { res, data } = await sendWebhook(baseUrl, "ping", {
    zen: "Keep it logically awesome.",
    hook_id: 123,
  })
  assertEqual(res.status, 200, "ping accepted")
  assertEqual(data.message, "Webhook ping received", "ping message")
  assertEqual(data.zen, "Keep it logically awesome.", "zen echoed")
  assertEqual(data.hookId, 123, "hook id echoed")
})

test("Webhook: duplicate delivery id is deduplicated", async (baseUrl) => {
  await resetDb(baseUrl)

  const payload = makePrPayload({
    action: "opened",
    prAuthor: "new-contributor",
    orgSlug: "fiveonefour",
    repoName: "sdk",
    prNumber: 88,
  })

  const firstRes = await fetch(`${baseUrl}/api/webhook/github`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": "dup-delivery-88",
    },
    body: JSON.stringify(payload),
  })
  assertEqual(firstRes.status, 200, "first delivery processed")

  const secondRes = await fetch(`${baseUrl}/api/webhook/github`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": "dup-delivery-88",
    },
    body: JSON.stringify(payload),
  })
  const secondData = await secondRes.json()
  assertEqual(secondRes.status, 200, "duplicate delivery accepted")
  assertEqual(secondData.message, "Duplicate delivery ignored", "duplicate ignored")
})

test("Webhook: unsigned PR comment includes branding with UTM", async (baseUrl) => {
  await resetDb(baseUrl)
  // "new-contributor" has never signed, so will get unsigned comment immediately
  const { data } = await sendWebhook(
    baseUrl,
    "pull_request",
    makePrPayload({
      action: "opened",
      prAuthor: "new-contributor",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 50,
    })
  )
  const md = data.comment.commentMarkdown as string
  assert(md.includes("Built with love by"), "has 'built with love' text")
  assert(md.includes("utm_source=cla_bot"), "branding link has utm_source")
  assert(md.includes("utm_medium=github_pr_comment"), "branding link has utm_medium")
  assert(md.includes("utm_campaign=fiveonefour_referral"), "branding link has utm_campaign")
})

// ==========================================
// RUNNER
// ==========================================

async function runAllTests(baseUrl: string): Promise<TestResult[]> {
  const results: TestResult[] = []

  for (const { name, fn } of tests) {
    const start = Date.now()
    try {
      await fn(baseUrl)
      results.push({ name, passed: true, duration: Date.now() - start })
    } catch (err) {
      results.push({
        name,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      })
    }
  }

  return results
}

function getTestCount(): number {
  return tests.length
}

vitestTest(
  "api end-to-end suite passes",
  async () => {
    expect(baseUrl).toBeTruthy()
    const originalFetch = globalThis.fetch
    globalThis.fetch = authedFetch as typeof globalThis.fetch

    try {
      const results = await runAllTests(baseUrl)
      const failed = results.filter((result) => !result.passed)
      const totalDuration = results.reduce((sum, result) => sum + result.duration, 0)

      console.log(
        `[tests] total=${getTestCount()} passed=${results.length - failed.length} failed=${failed.length} duration=${totalDuration}ms`
      )

      const details = failed
        .map((result) => `${result.name}: ${result.error ?? "Unknown error"}`)
        .join("\n")

      expect(failed.length, details || "Expected all API integration checks to pass").toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  },
  300_000
)
