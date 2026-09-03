/**
 * In-process SQL statement counter for development and tests.
 *
 * Wired into Drizzle as a `Logger` when NODE_ENV !== "production" (see
 * `lib/db/index.ts`). Lets the test-support endpoint and integration tests
 * answer "how many round trips did that webhook cost?" without guessing.
 *
 * Only statements issued through the Drizzle instance are counted. The raw
 * `sql` client used for startup checks and `resetDb()` bypasses this.
 *
 * State lives on `globalThis` so it survives Next.js dev hot reloads, matching
 * how the Drizzle singleton itself is stored.
 */

import type { Logger } from "drizzle-orm/logger"

export type DbQueryRecord = {
  seq: number
  at: number
  sql: string
  paramCount: number
}

type QueryStatsState = {
  count: number
  seq: number
  log: DbQueryRecord[]
}

const MAX_LOG_ENTRIES = 500
const MAX_SQL_LENGTH = 400

const globalForStats = globalThis as unknown as { __dbQueryStats?: QueryStatsState }

function getState(): QueryStatsState {
  if (!globalForStats.__dbQueryStats) {
    globalForStats.__dbQueryStats = { count: 0, seq: 0, log: [] }
  }
  return globalForStats.__dbQueryStats
}

export function recordDbQuery(sql: string, params: unknown[]): void {
  const state = getState()
  state.count += 1
  state.seq += 1
  state.log.push({
    seq: state.seq,
    at: Date.now(),
    sql: sql.length > MAX_SQL_LENGTH ? `${sql.slice(0, MAX_SQL_LENGTH)}…` : sql,
    paramCount: params.length,
  })
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES)
  }
}

export function getDbQueryStats(): { count: number; queries: DbQueryRecord[] } {
  const state = getState()
  return { count: state.count, queries: state.log.map((entry) => ({ ...entry })) }
}

export function resetDbQueryStats(): void {
  const state = getState()
  state.count = 0
  state.log = []
}

/** Drizzle `Logger` implementation that feeds the counter. */
export const dbQueryStatsLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    recordDbQuery(query, params)
  },
}
