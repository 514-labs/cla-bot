import { createHash } from "node:crypto"
import { neon } from "@neondatabase/serverless"
import { resetMockGitHub } from "@/lib/github/mock-github-client"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Playwright e2e tests")
}

const sql = neon(DATABASE_URL)

const DEFAULT_CLA_MARKDOWN = `# Contributor License Agreement

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

function sha256Hex(input: string) {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

export async function resetTestDatabase() {
  resetMockGitHub()
  await ensureTestSchemaCompatibility()

  const claHash = sha256Hex(DEFAULT_CLA_MARKDOWN)

  await sql`TRUNCATE audit_events, webhook_deliveries, cla_signatures, cla_archives, organizations, users CASCADE`

  const users = [
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
  ]

  for (const user of users) {
    await sql`INSERT INTO users (id, github_id, github_username, email, email_verified, email_source, avatar_url, name, role) VALUES (${user.id}, ${user.githubId}, ${user.githubUsername}, ${user.email}, ${user.emailVerified}, ${user.emailSource}, ${user.avatarUrl}, ${user.name}, ${user.role})`
  }

  const organizations = [
    {
      id: "org_1",
      githubOrgSlug: "fiveonefour",
      name: "Fiveonefour",
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=514&backgroundColor=059669",
      installedAt: "2025-08-15T10:00:00Z",
      adminUserId: "user_1",
      isActive: true,
      installationId: 10001,
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
    },
  ]

  for (const org of organizations) {
    await sql`INSERT INTO organizations (id, github_org_slug, name, avatar_url, installed_at, admin_user_id, is_active, installation_id, cla_text, cla_text_sha256) VALUES (${org.id}, ${org.githubOrgSlug}, ${org.name}, ${org.avatarUrl}, ${org.installedAt}, ${org.adminUserId}, ${org.isActive}, ${org.installationId}, ${DEFAULT_CLA_MARKDOWN}, ${claHash})`
  }

  await sql`INSERT INTO cla_archives (id, org_id, sha256, cla_text, created_at) VALUES (${"archive_1"}, ${"org_1"}, ${claHash}, ${DEFAULT_CLA_MARKDOWN}, ${"2025-08-15T10:00:00Z"})`
  await sql`INSERT INTO cla_archives (id, org_id, sha256, cla_text, created_at) VALUES (${"archive_2"}, ${"org_2"}, ${claHash}, ${DEFAULT_CLA_MARKDOWN}, ${"2025-09-01T14:30:00Z"})`

  const signatures = [
    {
      id: "sig_1",
      orgId: "org_1",
      userId: "user_2",
      githubUserIdAtSignature: "1002",
      signedAt: "2025-10-05T09:15:00Z",
      githubUsername: "contributor1",
      emailAtSignature: "jane.contributor@example.com",
      emailVerifiedAtSignature: true,
      emailSource: "primary_verified",
      consentTextVersion: "v1",
      sessionJti: "test-session-1",
      name: "Jane Contributor",
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
    },
    {
      id: "sig_2",
      orgId: "org_1",
      userId: "user_3",
      githubUserIdAtSignature: "1003",
      signedAt: "2025-10-12T16:45:00Z",
      githubUsername: "dev-sarah",
      emailAtSignature: "sarah.chen@example.com",
      emailVerifiedAtSignature: true,
      emailSource: "primary_verified",
      consentTextVersion: "v1",
      sessionJti: "test-session-2",
      name: "Sarah Chen",
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=SC&backgroundColor=7c3aed",
    },
    {
      id: "sig_3",
      orgId: "org_1",
      userId: "user_4",
      githubUserIdAtSignature: "1004",
      signedAt: "2025-11-01T11:30:00Z",
      githubUsername: "alex-codes",
      emailAtSignature: "alex.johnson@example.com",
      emailVerifiedAtSignature: true,
      emailSource: "primary_verified",
      consentTextVersion: "v1",
      sessionJti: "test-session-3",
      name: "Alex Johnson",
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=AJ&backgroundColor=dc2626",
    },
    {
      id: "sig_4",
      orgId: "org_2",
      userId: "user_2",
      githubUserIdAtSignature: "1002",
      signedAt: "2025-11-10T08:00:00Z",
      githubUsername: "contributor1",
      emailAtSignature: "jane.contributor@example.com",
      emailVerifiedAtSignature: true,
      emailSource: "primary_verified",
      consentTextVersion: "v1",
      sessionJti: "test-session-4",
      name: "Jane Contributor",
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
    },
  ]

  for (const signature of signatures) {
    await sql`INSERT INTO cla_signatures (id, org_id, user_id, cla_sha256, accepted_sha256, consent_text_version, assented, signed_at, github_user_id_at_signature, github_username, email_at_signature, email_verified_at_signature, email_source, session_jti, name, avatar_url) VALUES (${signature.id}, ${signature.orgId}, ${signature.userId}, ${claHash}, ${claHash}, ${signature.consentTextVersion}, ${true}, ${signature.signedAt}, ${signature.githubUserIdAtSignature}, ${signature.githubUsername}, ${signature.emailAtSignature}, ${signature.emailVerifiedAtSignature}, ${signature.emailSource}, ${signature.sessionJti}, ${signature.name}, ${signature.avatarUrl})`
  }
}

async function ensureTestSchemaCompatibility() {
  await sql`CREATE TABLE IF NOT EXISTS webhook_deliveries (delivery_id text PRIMARY KEY NOT NULL, event text NOT NULL, received_at text NOT NULL)`
  await sql`CREATE TABLE IF NOT EXISTS audit_events (id text PRIMARY KEY NOT NULL, event_type text NOT NULL, org_id text, user_id text, actor_github_id text, actor_github_username text, payload jsonb DEFAULT '{}'::jsonb NOT NULL, created_at text NOT NULL)`

  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_github_username_unique`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id text`
  await sql`ALTER TABLE users ALTER COLUMN github_id TYPE text USING github_id::text`
  await sql`UPDATE users SET github_id = CONCAT('legacy_', id) WHERE github_id IS NULL OR github_id = ''`
  await sql`ALTER TABLE users ALTER COLUMN github_id SET NOT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false NOT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_source text DEFAULT 'none' NOT NULL`
  await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_github_id_unique') THEN ALTER TABLE users ADD CONSTRAINT users_github_id_unique UNIQUE (github_id); END IF; END $$`

  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS accepted_sha256 text`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS consent_text_version text`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS assented boolean DEFAULT true NOT NULL`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS github_user_id_at_signature text`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS email_verified_at_signature boolean DEFAULT false NOT NULL`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS email_source text DEFAULT 'none' NOT NULL`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS session_jti text`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS ip_hash text`
  await sql`ALTER TABLE cla_signatures ADD COLUMN IF NOT EXISTS user_agent text`
  await sql`UPDATE cla_signatures SET accepted_sha256 = cla_sha256 WHERE accepted_sha256 IS NULL`
  await sql`UPDATE cla_signatures SET consent_text_version = 'v1' WHERE consent_text_version IS NULL`
  await sql`UPDATE cla_signatures AS sig SET github_user_id_at_signature = u.github_id FROM users AS u WHERE sig.user_id = u.id AND sig.github_user_id_at_signature IS NULL`
  await sql`UPDATE cla_signatures SET github_user_id_at_signature = CONCAT('legacy_', user_id) WHERE github_user_id_at_signature IS NULL`
  await sql`UPDATE cla_signatures SET session_jti = CONCAT('legacy-session-', id) WHERE session_jti IS NULL`
  await sql`ALTER TABLE cla_signatures ALTER COLUMN accepted_sha256 SET NOT NULL`
  await sql`ALTER TABLE cla_signatures ALTER COLUMN consent_text_version SET NOT NULL`
  await sql`ALTER TABLE cla_signatures ALTER COLUMN github_user_id_at_signature SET NOT NULL`
  await sql`ALTER TABLE cla_signatures ALTER COLUMN session_jti SET NOT NULL`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS cla_signatures_org_user_sha_idx ON cla_signatures (org_id, user_id, cla_sha256)`
}
