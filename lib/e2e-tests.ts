/**
 * End-to-end test suite for the CLA Bot application.
 *
 * Each test function exercises a full user flow through the API routes
 * and verifies the mock database state. Tests run sequentially and
 * each test resets the database before running.
 */

export type TestResult = {
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

async function resetDb(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/reset`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to reset database")
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function switchRole(baseUrl: string, role: "admin" | "contributor") {
  const res = await fetch(`${baseUrl}/api/mock-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) throw new Error(`Failed to switch to ${role}`)
  return res.json()
}

// ==========================================
// 1. AUTH & SESSION TESTS
// ==========================================

test("GET /api/mock-role returns default admin role", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/mock-role`)
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assertEqual(data.role, "admin", "role")
  assertEqual(data.user.githubUsername, "orgadmin", "username")
})

test("POST /api/mock-role switches to contributor", async (baseUrl) => {
  await resetDb(baseUrl)
  const data = await switchRole(baseUrl, "contributor")
  assertEqual(data.role, "contributor", "role")
  assertEqual(data.user.githubUsername, "contributor1", "username")
})

test("POST /api/mock-role rejects invalid role", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/mock-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "superadmin" }),
  })
  assertEqual(res.status, 400, "status")
})

test("POST /api/mock-role switches back to admin", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const data = await switchRole(baseUrl, "admin")
  assertEqual(data.role, "admin", "role")
  assertEqual(data.user.name, "Org Admin", "name")
})

// ==========================================
// 2. ADMIN ORG LISTING TESTS
// ==========================================

test("GET /api/orgs returns admin's orgs", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/orgs`)
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assert(Array.isArray(data.orgs), "orgs is array")
  assertEqual(data.orgs.length, 2, "org count")
  assertEqual(data.orgs[0].githubOrgSlug, "fiveonefour", "first org slug")
  assertEqual(data.orgs[1].githubOrgSlug, "moose-stack", "second org slug")
})

test("GET /api/orgs returns empty for contributor (no admin orgs)", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const res = await fetch(`${baseUrl}/api/orgs`)
  const data = await res.json()
  assertEqual(data.orgs.length, 0, "contributor should have no admin orgs")
})

// ==========================================
// 3. ORG DETAIL TESTS
// ==========================================

test("GET /api/orgs/fiveonefour returns org details, signers, and archives", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assertEqual(data.org.name, "Fiveonefour", "org name")
  assertEqual(data.org.isActive, true, "org is active")
  assert(
    data.currentClaMarkdown.includes("Contributor License Agreement"),
    "CLA content via currentClaMarkdown"
  )
  assertEqual(data.signers.length, 3, "fiveonefour signers count")
  assert(typeof data.currentClaSha256 === "string", "currentClaSha256 is a string")
  assert(data.currentClaSha256.length === 64, "sha256 is 64 hex chars")
  assert(Array.isArray(data.archives), "archives is array")
  assert(data.archives.length >= 1, "at least 1 archive exists")
})

test("GET /api/orgs/nonexistent returns 404", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/orgs/nonexistent`)
  assertEqual(res.status, 404, "status")
})

// ==========================================
// 4. CLA EDITING & VERSIONING TESTS
// ==========================================

test("PATCH /api/orgs/fiveonefour updates CLA text and sha256", async (baseUrl) => {
  await resetDb(baseUrl)
  const orgBefore = await fetch(`${baseUrl}/api/orgs/fiveonefour`).then((r) => r.json())
  const oldSha256 = orgBefore.currentClaSha256

  const newCla = "# Updated CLA\n\nNew agreement text here."
  const res = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: newCla }),
  })
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  // PATCH returns { org } with updated inline text + sha256
  assert(data.org !== undefined, "org returned")
  assertEqual(data.org.claText, newCla, "org has updated CLA text")
  assert(data.org.claTextSha256 !== oldSha256, "sha256 changed after edit")

  // Verify by re-fetching org detail
  const res2 = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const data2 = await res2.json()
  assertEqual(data2.currentClaMarkdown, newCla, "CLA persisted after re-fetch")
  assertEqual(data2.currentClaSha256, data.org.claTextSha256, "sha256 persisted")
})

test("Multiple CLA edits only update sha256 (no archive until signing)", async (baseUrl) => {
  await resetDb(baseUrl)
  const orgBefore = await fetch(`${baseUrl}/api/orgs/fiveonefour`).then((r) => r.json())
  const archivesBefore = orgBefore.archives.length

  // Edit 1
  const res1 = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# V2 CLA" }),
  })
  const data1 = await res1.json()

  // Edit 2
  const res2 = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# V3 CLA" }),
  })
  const data2 = await res2.json()
  assert(data1.org.claTextSha256 !== data2.org.claTextSha256, "each edit produces different sha256")

  // Verify: no new archives created (only signings create archives)
  const orgAfter = await fetch(`${baseUrl}/api/orgs/fiveonefour`).then((r) => r.json())
  assertEqual(orgAfter.archives.length, archivesBefore, "no new archives from edits alone")
  assertEqual(orgAfter.currentClaMarkdown, "# V3 CLA", "latest CLA content")
})

test("PATCH /api/orgs/fiveonefour rejects missing claMarkdown", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  assertEqual(res.status, 400, "status")
})

test("PATCH /api/orgs/nonexistent returns 404", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/orgs/nonexistent`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "test" }),
  })
  assertEqual(res.status, 404, "status")
})

// ==========================================
// 5. ACTIVATE / DEACTIVATE TESTS
// ==========================================

test("PATCH /api/orgs/fiveonefour can deactivate an org", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: false }),
  })
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assertEqual(data.org.isActive, false, "org deactivated")

  // Verify persists
  const res2 = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const data2 = await res2.json()
  assertEqual(data2.org.isActive, false, "deactivation persisted")
})

test("PATCH /api/orgs/fiveonefour can re-activate an org", async (baseUrl) => {
  await resetDb(baseUrl)
  // Deactivate
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: false }),
  })
  // Re-activate
  const res = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: true }),
  })
  const data = await res.json()
  assertEqual(data.org.isActive, true, "org re-activated")
})

test("POST /api/sign blocks signing on deactivated org", async (baseUrl) => {
  await resetDb(baseUrl)
  // Deactivate the org
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: false }),
  })
  // Try to sign as admin
  const res = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(res.status, 403, "signing blocked on inactive org")
})

// ==========================================
// 6. CLA SIGNING FLOW TESTS
// ==========================================

test("GET /api/sign/fiveonefour shows already signed for contributor", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const res = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assertEqual(data.alreadySigned, true, "already signed")
  assertEqual(data.needsResign, false, "no re-sign needed")
  assert(data.signature !== null, "signature exists")
  assertEqual(data.user.githubUsername, "contributor1", "user is contributor")
})

test("GET /api/sign/fiveonefour shows not signed for admin", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assertEqual(data.alreadySigned, false, "admin hasn't signed")
  assertEqual(data.signature, null, "no signature")
})

test("POST /api/sign creates a new signature", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assert(data.signature !== undefined, "signature returned")
  assertEqual(data.signature.githubUsername, "orgadmin", "signer username")

  // Verify persisted
  const res2 = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const data2 = await res2.json()
  assertEqual(data2.alreadySigned, true, "now signed")
})

test("POST /api/sign prevents duplicate signatures", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const res = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(res.status, 409, "duplicate rejected")
})

test("POST /api/sign rejects missing orgSlug", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  assertEqual(res.status, 400, "status")
})

test("POST /api/sign returns 404 for nonexistent org", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "does-not-exist" }),
  })
  assertEqual(res.status, 404, "status")
})

test("GET /api/sign/nonexistent returns 404", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/sign/nonexistent`)
  assertEqual(res.status, 404, "status")
})

// ==========================================
// 7. RE-SIGN AFTER CLA UPDATE TESTS
// ==========================================

test("CLA update invalidates existing signatures (needs re-sign)", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Contributor has signed the current CLA
  await switchRole(baseUrl, "contributor")
  const res1 = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const data1 = await res1.json()
  assertEqual(data1.alreadySigned, true, "contributor signed current CLA")
  assertEqual(data1.needsResign, false, "no re-sign needed yet")
  const originalSha256 = data1.currentSha256

  // Step 2: Admin updates the CLA text (changes sha256)
  await switchRole(baseUrl, "admin")
  const patchRes = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2\n\nNew terms." }),
  })
  const patchData = await patchRes.json()
  assert(patchData.org.claTextSha256 !== originalSha256, "sha256 changed after edit")

  // Step 3: Contributor now needs to re-sign
  await switchRole(baseUrl, "contributor")
  const res2 = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const data2 = await res2.json()
  assertEqual(data2.alreadySigned, false, "not signed for current version")
  assertEqual(data2.needsResign, true, "re-sign required")
  assert(data2.signedSha256 !== null, "old signed sha256 returned")
  assert(data2.signedSha256 !== data2.currentSha256, "signed sha256 differs from current")
})

test("Contributor can re-sign after CLA update", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin updates CLA
  await switchRole(baseUrl, "admin")
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2" }),
  })

  // Step 2: Contributor re-signs
  await switchRole(baseUrl, "contributor")
  const signRes = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(signRes.status, 200, "re-sign succeeded")
  const signData = await signRes.json()
  assert(signData.signature !== undefined, "new signature returned")

  // Step 3: Verify contributor is now on current version
  const res = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const data = await res.json()
  assertEqual(data.alreadySigned, true, "now signed current version")
  assertEqual(data.needsResign, false, "no re-sign needed")
})

test("Admin signers list shows outdated badges after CLA update", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Check initial state -- all 3 signers on current sha256
  const res1 = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const data1 = await res1.json()
  assertEqual(data1.signers.length, 3, "3 signers initially")
  const allOnCurrent = data1.signers.every(
    (s: { claSha256: string }) => s.claSha256 === data1.currentClaSha256
  )
  assert(allOnCurrent, "all signers on current version initially")

  // Step 2: Admin updates CLA
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2" }),
  })

  // Step 3: All signers are now outdated (their sha256 != new sha256)
  const res2 = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const data2 = await res2.json()
  assertEqual(data2.signers.length, 3, "still 3 signers")
  const noneOnCurrent = data2.signers.every(
    (s: { claSha256: string }) => s.claSha256 !== data2.currentClaSha256
  )
  assert(noneOnCurrent, "all signers now on outdated version")
})

test("Contributor dashboard shows re-sign required after CLA update", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin updates CLA
  await switchRole(baseUrl, "admin")
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2" }),
  })

  // Step 2: Contributor checks their dashboard
  await switchRole(baseUrl, "contributor")
  const res = await fetch(`${baseUrl}/api/contributor`)
  const data = await res.json()
  const fiveOneFourSig = data.signatures.find(
    (s: { orgSlug: string }) => s.orgSlug === "fiveonefour"
  )
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

test("GET /api/contributor returns signed CLAs for contributor", async (baseUrl) => {
  await resetDb(baseUrl)
  await switchRole(baseUrl, "contributor")
  const res = await fetch(`${baseUrl}/api/contributor`)
  const data = await res.json()
  assertEqual(res.status, 200, "status")
  assertEqual(data.user.githubUsername, "contributor1", "user")
  assertEqual(data.signatures.length, 2, "signature count")
  assert(
    data.signatures.some((s: { orgSlug: string }) => s.orgSlug === "fiveonefour"),
    "fiveonefour CLA present"
  )
  assert(
    data.signatures.some((s: { orgSlug: string }) => s.orgSlug === "moose-stack"),
    "moose-stack CLA present"
  )
})

test("GET /api/contributor returns empty for admin (no signatures)", async (baseUrl) => {
  await resetDb(baseUrl)
  const res = await fetch(`${baseUrl}/api/contributor`)
  const data = await res.json()
  assertEqual(data.signatures.length, 0, "admin has no signatures")
})

// ==========================================
// 9. FULL END-TO-END FLOWS
// ==========================================

test("Full flow: sign, update CLA, verify outdated, re-sign", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin signs fiveonefour CLA (v1)
  const signRes1 = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(signRes1.status, 200, "admin sign v1 success")

  // Step 2: Verify admin signed v1
  const checkRes1 = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const checkData1 = await checkRes1.json()
  assertEqual(checkData1.alreadySigned, true, "admin signed")
  assertEqual(checkData1.needsResign, false, "no re-sign needed")

  // Step 3: Admin updates CLA to v2
  const patchRes = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Completely new CLA v2" }),
  })
  assertEqual(patchRes.status, 200, "CLA update success")

  // Step 4: Admin now needs to re-sign (their v1 signature is outdated)
  const checkRes2 = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const checkData2 = await checkRes2.json()
  assertEqual(checkData2.alreadySigned, false, "not signed for v2")
  assertEqual(checkData2.needsResign, true, "re-sign needed")

  // Step 5: Admin re-signs
  const signRes2 = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(signRes2.status, 200, "admin re-sign success")

  // Step 6: Verify admin is now on current version
  const checkRes3 = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const checkData3 = await checkRes3.json()
  assertEqual(checkData3.alreadySigned, true, "admin now signed v2")
  assertEqual(checkData3.needsResign, false, "no re-sign needed")

  // Step 7: Verify signers list -- admin should appear with current version
  const orgRes = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const orgData = await orgRes.json()
  // Original 3 signers on v1 + admin on v1 + admin on v2 = 5 total signer rows
  assert(orgData.signers.length >= 4, "signers increased")
  // At least one signer on current sha256 (admin's re-sign)
  const currentSigners = orgData.signers.filter(
    (s: { claSha256: string }) => s.claSha256 === orgData.currentClaSha256
  )
  assert(currentSigners.length >= 1, "at least 1 signer on current version")
})

test("Full flow: CLA edit visible on sign page", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Admin edits CLA
  const newCla = "# Custom CLA\n\nThis is a totally custom agreement."
  const patchRes = await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: newCla }),
  })
  assertEqual(patchRes.status, 200, "patch success")

  // Step 2: Contributor sees updated CLA on sign page
  await switchRole(baseUrl, "contributor")
  const signPageRes = await fetch(`${baseUrl}/api/sign/fiveonefour`)
  const signPageData = await signPageRes.json()
  assertEqual(signPageData.org.claMarkdown, newCla, "CLA is updated on sign page")
})

test("Full flow: role switching maintains separate data views", async (baseUrl) => {
  await resetDb(baseUrl)

  // As admin, see 2 orgs
  const adminOrgsRes = await fetch(`${baseUrl}/api/orgs`)
  const adminOrgsData = await adminOrgsRes.json()
  assertEqual(adminOrgsData.orgs.length, 2, "admin sees 2 orgs")
  assertEqual(adminOrgsData.user.role, "admin", "user is admin")

  // Switch to contributor
  await switchRole(baseUrl, "contributor")

  // As contributor, see 0 admin orgs but 2 signed CLAs
  const contribOrgsRes = await fetch(`${baseUrl}/api/orgs`)
  const contribOrgsData = await contribOrgsRes.json()
  assertEqual(contribOrgsData.orgs.length, 0, "contributor sees 0 admin orgs")

  const contribRes = await fetch(`${baseUrl}/api/contributor`)
  const contribData = await contribRes.json()
  assertEqual(contribData.signatures.length, 2, "contributor has 2 signed CLAs")
  assertEqual(contribData.user.role, "contributor", "user is contributor")

  // Switch back to admin
  await switchRole(baseUrl, "admin")

  const adminOrgsRes2 = await fetch(`${baseUrl}/api/orgs`)
  const adminOrgsData2 = await adminOrgsRes2.json()
  assertEqual(adminOrgsData2.orgs.length, 2, "admin sees orgs again")
})

test("Full flow: deactivate org blocks signing, reactivate allows it", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Deactivate
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: false }),
  })

  // Step 2: Signing blocked
  const signRes1 = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(signRes1.status, 403, "signing blocked when inactive")

  // Step 3: Reactivate
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: true }),
  })

  // Step 4: Signing allowed again
  const signRes2 = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  assertEqual(signRes2.status, 200, "signing allowed when reactivated")
})

// ==========================================
// 10. DATABASE RESET TEST
// ==========================================

test("POST /api/reset restores initial state", async (baseUrl) => {
  // Mutate data
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "MUTATED" }),
  })

  // Reset
  await resetDb(baseUrl)

  // Verify restored
  const res = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const data = await res.json()
  assert(
    data.currentClaMarkdown.includes("Contributor License Agreement"),
    "CLA restored to original"
  )
  assertEqual(data.signers.length, 3, "signers restored")
  assertEqual(data.org.isActive, true, "active state restored")
  assertEqual(data.archives.length, 1, "archives restored to 1")
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
  orgSlug: string
  repoName: string
  prNumber: number
}) {
  return {
    action: opts.action,
    number: opts.prNumber,
    pull_request: {
      user: { login: opts.prAuthor },
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

// -- Scenario 2b: After signing, check auto-updates (no /recheck needed) --

test("Webhook: after signing, check auto-updates to success (no /recheck needed)", async (baseUrl) => {
  await resetDb(baseUrl)

  // Step 1: Update CLA to v2 so contributor1's existing v1 sig is stale
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2" }),
  })

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
  const signRes = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  const signData = await signRes.json()
  assertEqual(signRes.status, 200, "sign succeeded")

  // Step 4: Verify check was auto-updated via GitHub client (no /recheck needed!)
  assert(signData.updatedChecks !== undefined, "updatedChecks returned")
  assert(signData.updatedChecks.length > 0, "at least one check was auto-updated")
  assertEqual(signData.updatedChecks[0].conclusion, "success", "check auto-updated to success")

  // Step 5: Verify the bot comment was also updated to show "CLA Signed"
  const getRes = await fetch(
    `${baseUrl}/api/webhook/github?orgSlug=fiveonefour&repoName=sdk&prNumber=20`
  )
  const getData = await getRes.json()
  assert(
    getData.comment === null || getData.comment.commentMarkdown.includes("CLA Signed"),
    "comment updated to signed status"
  )
})

// -- Scenario 3: Non-member, signed old version -> red check + re-sign comment --

test("Webhook: CLA updated -> contributor needs re-sign -> failing check", async (baseUrl) => {
  await resetDb(baseUrl)

  // Update CLA (creates v2, invalidates contributor1's v1 signature)
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2" }),
  })

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

test("Webhook: re-sign flow -- sign auto-updates check + comment", async (baseUrl) => {
  await resetDb(baseUrl)

  // Update CLA to v2
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2" }),
  })

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
  const signRes = await fetch(`${baseUrl}/api/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgSlug: "fiveonefour" }),
  })
  const signData = await signRes.json()
  assertEqual(signRes.status, 200, "re-sign succeeded")
  assert(signData.updatedChecks.length > 0, "check auto-updated after re-sign")
  assertEqual(signData.updatedChecks[0].conclusion, "success", "check is now success")
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

// -- Scenario 5: Bot deactivated -> NO check, NO comment --

test("Webhook: inactive org -> no check, no comment, completely skipped", async (baseUrl) => {
  await resetDb(baseUrl)

  // Deactivate org
  await fetch(`${baseUrl}/api/orgs/fiveonefour`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive: false }),
  })

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
  assertEqual(data.check, undefined, "no check run created")
  assertEqual(data.comment, undefined, "no comment posted")
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

test("Webhook: /recheck for org member -> auto-pass", async (baseUrl) => {
  await resetDb(baseUrl)
  const { data } = await sendWebhook(baseUrl, "issue_comment", {
    action: "created",
    comment: { body: "/recheck" },
    issue: { number: 7, user: { login: "orgadmin" } },
    repository: { name: "sdk", owner: { login: "fiveonefour" } },
  })
  assertEqual(data.check.status, "success", "org member recheck passes")
  assertEqual(data.orgMember, true, "flagged as org member")
  assertEqual(data.comment, null, "no comment for org member")
})

test("Webhook: installation created registers new org", async (baseUrl) => {
  await resetDb(baseUrl)
  const { data } = await sendWebhook(baseUrl, "installation", {
    action: "created",
    installation: { account: { login: "new-org" } },
  })
  assert(data.message.includes("new-org"), "message references org")
  assert(data.org !== undefined, "org object returned")

  const orgRes = await fetch(`${baseUrl}/api/orgs/new-org`)
  assertEqual(orgRes.status, 200, "new org accessible")
})

test("Webhook: installation deleted deactivates org", async (baseUrl) => {
  await resetDb(baseUrl)
  const { data } = await sendWebhook(baseUrl, "installation", {
    action: "deleted",
    installation: { account: { login: "fiveonefour" } },
  })
  assert(data.message.includes("uninstalled"), "uninstall message")

  const orgRes = await fetch(`${baseUrl}/api/orgs/fiveonefour`)
  const orgData = await orgRes.json()
  assertEqual(orgData.org.isActive, false, "org deactivated after uninstall")
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
  assert(md.includes("fiveonefour.com?utm_source=github"), "branding link has utm_source")
  assert(md.includes("utm_medium=pr_comment"), "branding link has utm_medium")
  assert(md.includes("utm_campaign=cla_bot_branding"), "branding link has utm_campaign")
})

// ==========================================
// RUNNER
// ==========================================

export async function runAllTests(baseUrl: string): Promise<TestResult[]> {
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

export function getTestCount(): number {
  return tests.length
}
