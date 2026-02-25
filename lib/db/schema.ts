import { pgTable, text, boolean, integer, uniqueIndex, jsonb } from "drizzle-orm/pg-core"

// ── Users ──────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  githubUsername: text("github_username").notNull(),
  /** Immutable GitHub account ID (string form) — used for identity matching */
  githubId: text("github_id").notNull().unique(),
  /** OAuth token encrypted at rest; used for org-admin authorization checks */
  githubAccessTokenEncrypted: text("github_access_token_encrypted"),
  /** Comma-separated scopes granted to the OAuth token */
  githubTokenScopes: text("github_token_scopes"),
  /** ISO timestamp for when the OAuth token was last updated */
  githubTokenUpdatedAt: text("github_token_updated_at"),
  /** GitHub email at last OAuth sync */
  email: text("email").notNull().default(""),
  /** Whether the synced email is currently verified by GitHub */
  emailVerified: boolean("email_verified").notNull().default(false),
  /** Source of current email value: profile | primary_verified | verified | any | none */
  emailSource: text("email_source").notNull().default("none"),
  avatarUrl: text("avatar_url").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("contributor"),
})

// ── Organizations ──────────────────────────────────────────────────
// The live CLA text lives directly on the org row together with its
// sha256 digest. Saving an edit just overwrites these two columns --
// no archive row is created until someone actually signs.
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  githubOrgSlug: text("github_org_slug").notNull().unique(),
  /** GitHub installation target type: organization | user */
  githubAccountType: text("github_account_type").notNull().default("organization"),
  /** Immutable GitHub installation target account ID (string form) */
  githubAccountId: text("github_account_id"),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  installedAt: text("installed_at").notNull(),
  adminUserId: text("admin_user_id")
    .notNull()
    .references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  /** GitHub App installation ID — used to authenticate API calls for this org */
  installationId: integer("installation_id"),
  /** The current CLA markdown text */
  claText: text("cla_text").notNull().default(""),
  /** SHA-256 hex digest of claText -- null means no CLA configured yet */
  claTextSha256: text("cla_text_sha256"),
})

// ── CLA Bypass Accounts ───────────────────────────────────────────
// Org-scoped allowlist of GitHub accounts that bypass CLA enforcement.
export const orgClaBypassAccounts = pgTable(
  "org_cla_bypass_accounts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    githubUserId: text("github_user_id").notNull(),
    githubUsername: text("github_username").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("org_cla_bypass_accounts_org_github_user_idx").on(table.orgId, table.githubUserId),
  ]
)

// ── CLA Archives ───────────────────────────────────────────────────
// Point-in-time snapshot of the CLA text, created lazily the first
// time someone signs a particular sha256. Rapid edits with no
// signings in between produce zero archive rows.
export const claArchives = pgTable(
  "cla_archives",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    sha256: text("sha256").notNull(),
    claText: text("cla_text").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("cla_archives_org_sha256_idx").on(table.orgId, table.sha256)]
)

// ── CLA Signatures ─────────────────────────────────────────────────
// Links a user to the sha256 of the CLA text they signed.
// To check validity: compare signature.claSha256 vs org.claTextSha256.
export const claSignatures = pgTable(
  "cla_signatures",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** SHA-256 of the CLA text the user signed */
    claSha256: text("cla_sha256").notNull(),
    /** The hash the user explicitly accepted in the sign request payload */
    acceptedSha256: text("accepted_sha256").notNull(),
    /** UI/legal consent copy version shown when the user accepted */
    consentTextVersion: text("consent_text_version").notNull(),
    /** Explicit assent flag captured server-side */
    assented: boolean("assented").notNull().default(true),
    signedAt: text("signed_at").notNull(),
    /** Immutable GitHub user ID captured at signing time */
    githubUserIdAtSignature: text("github_user_id_at_signature").notNull(),
    githubUsername: text("github_username").notNull(),
    /** Email captured at the moment the signature is created */
    emailAtSignature: text("email_at_signature").notNull(),
    /** Whether the captured email was verified by GitHub */
    emailVerifiedAtSignature: boolean("email_verified_at_signature").notNull().default(false),
    /** Source of captured email: profile | primary_verified | verified | any | none */
    emailSource: text("email_source").notNull().default("none"),
    /** JWT ID tied to the authenticated session used for signing */
    sessionJti: text("session_jti").notNull(),
    /** HMAC-SHA256 hash of source IP (nullable when unavailable) */
    ipHash: text("ip_hash"),
    /** Request user-agent snapshot at signing time (nullable when unavailable) */
    userAgent: text("user_agent"),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url").notNull(),
  },
  (table) => [
    uniqueIndex("cla_signatures_org_user_sha_idx").on(table.orgId, table.userId, table.claSha256),
  ]
)

// ── Webhook Deliveries ──────────────────────────────────────────────
// Persistent delivery de-duplication for webhook events.
export const webhookDeliveries = pgTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: text("received_at").notNull(),
})

// ── Audit Events ────────────────────────────────────────────────────
// Append-only audit log for security/compliance-relevant actions.
export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  orgId: text("org_id").references(() => organizations.id),
  userId: text("user_id").references(() => users.id),
  actorGithubId: text("actor_github_id"),
  actorGithubUsername: text("actor_github_username"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text("created_at").notNull(),
})
