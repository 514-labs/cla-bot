import { pgTable, text, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core"

// ── Users ──────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  githubUsername: text("github_username").notNull().unique(),
  /** Numeric GitHub user ID — used to match OAuth sessions */
  githubId: integer("github_id"),
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
  (table) => [
    uniqueIndex("cla_archives_org_sha256_idx").on(table.orgId, table.sha256),
  ],
)

// ── CLA Signatures ─────────────────────────────────────────────────
// Links a user to the sha256 of the CLA text they signed.
// To check validity: compare signature.claSha256 vs org.claTextSha256.
export const claSignatures = pgTable("cla_signatures", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  /** SHA-256 of the CLA text the user signed */
  claSha256: text("cla_sha256").notNull(),
  signedAt: text("signed_at").notNull(),
  githubUsername: text("github_username").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
})
