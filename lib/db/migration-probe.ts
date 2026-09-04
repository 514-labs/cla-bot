/**
 * Cold-start schema probe helpers.
 *
 * In production the app verifies once per process that migrations have been
 * applied. That used to cost six sequential round trips (one per table plus
 * the migrations table). `assertMigrationsApplied` now issues a single
 * statement that resolves every required relation at once; these helpers keep
 * the table list and the result interpretation testable without a database.
 */

export const REQUIRED_TABLES = [
  "users",
  "cla_signatures",
  "org_cla_bypass_accounts",
  "webhook_deliveries",
  "audit_events",
] as const

export const MIGRATIONS_COLUMN = "migrations_table"

/**
 * Given the single probe row (one column per required table holding
 * `to_regclass(...)`, plus `migrations_table`), return the names that did not
 * resolve. Empty array means the schema is present.
 */
export function missingRelations(
  row: Record<string, unknown> | undefined,
  migrationsLabel: string
): string[] {
  if (!row) return [...REQUIRED_TABLES, migrationsLabel]
  const missing: string[] = []
  for (const table of REQUIRED_TABLES) {
    if (row[table] === null || row[table] === undefined) missing.push(table)
  }
  if (row[MIGRATIONS_COLUMN] === null || row[MIGRATIONS_COLUMN] === undefined) {
    missing.push(migrationsLabel)
  }
  return missing
}
