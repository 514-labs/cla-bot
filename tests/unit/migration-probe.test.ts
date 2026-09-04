import { describe, expect, it } from "vitest"
import { MIGRATIONS_COLUMN, missingRelations, REQUIRED_TABLES } from "@/lib/db/migration-probe"

function fullRow(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = { [MIGRATIONS_COLUMN]: 1 }
  for (const table of REQUIRED_TABLES) row[table] = `public.${table}`
  return { ...row, ...overrides }
}

describe("missingRelations", () => {
  it("returns nothing when every relation resolved", () => {
    expect(missingRelations(fullRow(), "drizzle.__drizzle_migrations")).toEqual([])
  })

  it("names each table whose to_regclass came back null", () => {
    const row = fullRow({ cla_signatures: null, audit_events: null })
    expect(missingRelations(row, "drizzle.__drizzle_migrations")).toEqual([
      "cla_signatures",
      "audit_events",
    ])
  })

  it("reports the migrations table by its configured label", () => {
    const row = fullRow({ [MIGRATIONS_COLUMN]: null })
    expect(missingRelations(row, "drizzle.__drizzle_migrations")).toEqual([
      "drizzle.__drizzle_migrations",
    ])
  })

  it("treats a missing row as everything missing", () => {
    expect(missingRelations(undefined, "m")).toEqual([...REQUIRED_TABLES, "m"])
  })
})
