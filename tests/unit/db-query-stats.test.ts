import { beforeEach, describe, expect, it } from "vitest"
import {
  dbQueryStatsLogger,
  getDbQueryStats,
  recordDbQuery,
  resetDbQueryStats,
} from "@/lib/db/query-stats"

describe("db query stats", () => {
  beforeEach(() => resetDbQueryStats())

  it("counts statements and keeps an ordered log", () => {
    recordDbQuery("select 1", [])
    dbQueryStatsLogger.logQuery("select * from users where id = $1", ["user_1"])

    const stats = getDbQueryStats()
    expect(stats.count).toBe(2)
    expect(stats.queries.map((q) => q.seq)).toEqual([1, 2])
    expect(stats.queries[1]).toMatchObject({
      sql: "select * from users where id = $1",
      paramCount: 1,
    })
  })

  it("truncates very long SQL but still counts it", () => {
    recordDbQuery("x".repeat(1000), [])
    const stats = getDbQueryStats()
    expect(stats.count).toBe(1)
    expect(stats.queries[0].sql.length).toBeLessThan(1000)
    expect(stats.queries[0].sql.endsWith("…")).toBe(true)
  })

  it("caps the retained log while keeping the total count", () => {
    for (let i = 0; i < 600; i += 1) recordDbQuery(`select ${i}`, [])
    const stats = getDbQueryStats()
    expect(stats.count).toBe(600)
    expect(stats.queries).toHaveLength(500)
    expect(stats.queries[0].sql).toBe("select 100")
  })

  it("reset clears count and log", () => {
    recordDbQuery("select 1", [])
    resetDbQueryStats()
    expect(getDbQueryStats()).toEqual({ count: 0, queries: [] })
  })

  it("returns copies, not live references", () => {
    recordDbQuery("select 1", [])
    const first = getDbQueryStats()
    first.queries.push({ seq: 99, at: 0, sql: "tampered", paramCount: 0 })
    expect(getDbQueryStats().queries).toHaveLength(1)
  })
})
