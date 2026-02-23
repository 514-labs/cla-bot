import type { Database } from "./index"
import { users, organizations, claArchives, claSignatures } from "./schema"
import { sha256Hex } from "./sha256"

/**
 * Insert initial seed data into the database.
 *
 * IMPORTANT: Insert order matters due to foreign key constraints:
 * users -> organizations -> claArchives -> claSignatures
 */
export async function seedDatabase(db: Database) {
  const claHash = await sha256Hex(DEFAULT_CLA_MARKDOWN)

  // 1. Users
  await db
    .insert(users)
    .values([
      {
        id: "user_1",
        githubId: "1001",
        githubUsername: "orgadmin",
        email: "orgadmin@fiveonefour.com",
        emailVerified: true,
        emailSource: "primary_verified",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=OA&backgroundColor=059669",
        name: "Org Admin",
        role: "admin",
      },
      {
        id: "user_2",
        githubId: "1002",
        githubUsername: "contributor1",
        email: "jane.contributor@example.com",
        emailVerified: true,
        emailSource: "primary_verified",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
        name: "Jane Contributor",
        role: "contributor",
      },
      {
        id: "user_3",
        githubId: "1003",
        githubUsername: "dev-sarah",
        email: "sarah.chen@example.com",
        emailVerified: true,
        emailSource: "primary_verified",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=SC&backgroundColor=7c3aed",
        name: "Sarah Chen",
        role: "contributor",
      },
      {
        id: "user_4",
        githubId: "1004",
        githubUsername: "alex-codes",
        email: "alex.johnson@example.com",
        emailVerified: true,
        emailSource: "primary_verified",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=AJ&backgroundColor=dc2626",
        name: "Alex Johnson",
        role: "contributor",
      },
    ])
    .onConflictDoNothing()

  // 2. Organizations -- CLA text + sha256 live inline
  await db
    .insert(organizations)
    .values([
      {
        id: "org_1",
        githubOrgSlug: "fiveonefour",
        name: "Fiveonefour",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=514&backgroundColor=059669",
        installedAt: "2025-08-15T10:00:00Z",
        adminUserId: "user_1",
        isActive: true,
        installationId: 10001,
        claText: DEFAULT_CLA_MARKDOWN,
        claTextSha256: claHash,
      },
      {
        id: "org_2",
        githubOrgSlug: "moose-stack",
        name: "MooseStack",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=MS&backgroundColor=059669",
        installedAt: "2025-09-01T14:30:00Z",
        adminUserId: "user_1",
        isActive: true,
        installationId: 10002,
        claText: DEFAULT_CLA_MARKDOWN,
        claTextSha256: claHash,
      },
    ])
    .onConflictDoNothing()

  // 3. CLA Archives -- snapshot for the text that was signed
  await db
    .insert(claArchives)
    .values([
      {
        id: "archive_1",
        orgId: "org_1",
        sha256: claHash,
        claText: DEFAULT_CLA_MARKDOWN,
        createdAt: "2025-08-15T10:00:00Z",
      },
      {
        id: "archive_2",
        orgId: "org_2",
        sha256: claHash,
        claText: DEFAULT_CLA_MARKDOWN,
        createdAt: "2025-09-01T14:30:00Z",
      },
    ])
    .onConflictDoNothing()

  // 4. CLA Signatures -- linked to the sha256 they signed
  await db
    .insert(claSignatures)
    .values([
      {
        id: "sig_1",
        orgId: "org_1",
        userId: "user_2",
        claSha256: claHash,
        acceptedSha256: claHash,
        consentTextVersion: "v1",
        assented: true,
        signedAt: "2025-10-05T09:15:00Z",
        githubUserIdAtSignature: "1002",
        githubUsername: "contributor1",
        emailAtSignature: "jane.contributor@example.com",
        emailVerifiedAtSignature: true,
        emailSource: "primary_verified",
        sessionJti: "seed-session-1",
        name: "Jane Contributor",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
      },
      {
        id: "sig_2",
        orgId: "org_1",
        userId: "user_3",
        claSha256: claHash,
        acceptedSha256: claHash,
        consentTextVersion: "v1",
        assented: true,
        signedAt: "2025-10-12T16:45:00Z",
        githubUserIdAtSignature: "1003",
        githubUsername: "dev-sarah",
        emailAtSignature: "sarah.chen@example.com",
        emailVerifiedAtSignature: true,
        emailSource: "primary_verified",
        sessionJti: "seed-session-2",
        name: "Sarah Chen",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=SC&backgroundColor=7c3aed",
      },
      {
        id: "sig_3",
        orgId: "org_1",
        userId: "user_4",
        claSha256: claHash,
        acceptedSha256: claHash,
        consentTextVersion: "v1",
        assented: true,
        signedAt: "2025-11-01T11:30:00Z",
        githubUserIdAtSignature: "1004",
        githubUsername: "alex-codes",
        emailAtSignature: "alex.johnson@example.com",
        emailVerifiedAtSignature: true,
        emailSource: "primary_verified",
        sessionJti: "seed-session-3",
        name: "Alex Johnson",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=AJ&backgroundColor=dc2626",
      },
      {
        id: "sig_4",
        orgId: "org_2",
        userId: "user_2",
        claSha256: claHash,
        acceptedSha256: claHash,
        consentTextVersion: "v1",
        assented: true,
        signedAt: "2025-11-10T08:00:00Z",
        githubUserIdAtSignature: "1002",
        githubUsername: "contributor1",
        emailAtSignature: "jane.contributor@example.com",
        emailVerifiedAtSignature: true,
        emailSource: "primary_verified",
        sessionJti: "seed-session-4",
        name: "Jane Contributor",
        avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
      },
    ])
    .onConflictDoNothing()
}

export const DEFAULT_CLA_MARKDOWN = `# Contributor License Agreement

Thank you for your interest in contributing to our project. In order to clarify the intellectual property license granted with contributions from any person or entity, we must have a Contributor License Agreement ("CLA") on file that has been signed by each contributor, indicating agreement to the license terms below.

## Terms

1. **Definitions.** "You" (or "Your") shall mean the copyright owner or legal entity authorized by the copyright owner that is making this Agreement. "Contribution" shall mean any original work of authorship, including any modifications or additions to an existing work, that is intentionally submitted by You for inclusion in the project.

2. **Grant of Copyright License.** Subject to the terms and conditions of this Agreement, You hereby grant a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute Your Contributions and such derivative works.

3. **Grant of Patent License.** Subject to the terms and conditions of this Agreement, You hereby grant a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work.

4. **You represent that you are legally entitled to grant the above license.** If your employer(s) has rights to intellectual property that you create, you represent that you have received permission to make Contributions on behalf of that employer.

5. **You represent that each of Your Contributions is Your original creation.**

6. **You are not expected to provide support for Your Contributions**, except to the extent You desire to provide support. You may provide support for free, for a fee, or not at all.

By signing below, you accept and agree to the terms of this Contributor License Agreement for all present and future contributions.
`
