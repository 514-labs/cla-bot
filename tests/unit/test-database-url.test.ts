import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  assertSafeTestDatabaseUrl,
  getTestDatabaseUrl,
  isLocalDatabaseUrl,
  requireTestDatabaseUrl,
} from "@/tests/utils/test-database-url"

const ORIGINAL_ENV = { ...process.env }

function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of ["TEST_DATABASE_URL", "DATABASE_URL", "ALLOW_REMOTE_TEST_DATABASE"]) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value
  }
}

describe("test database URL guard", () => {
  beforeEach(() => setEnv({}))
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("recognizes local hosts", () => {
    expect(isLocalDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:5488/clabot_test")).toBe(
      true
    )
    expect(isLocalDatabaseUrl("postgres://u:p@localhost/db")).toBe(true)
    expect(isLocalDatabaseUrl("postgres://u:p@ep-x-pooler.us-east-1.aws.neon.tech/db")).toBe(false)
    expect(isLocalDatabaseUrl("not a url")).toBe(false)
  })

  it("prefers TEST_DATABASE_URL over DATABASE_URL", () => {
    setEnv({
      TEST_DATABASE_URL: "postgres://u:p@localhost:1/explicit",
      DATABASE_URL: "postgres://u:p@localhost:2/fallback",
    })
    expect(getTestDatabaseUrl()).toBe("postgres://u:p@localhost:1/explicit")
  })

  it("falls back to DATABASE_URL when local", () => {
    setEnv({ DATABASE_URL: "postgres://u:p@127.0.0.1:5488/db" })
    expect(getTestDatabaseUrl()).toBe("postgres://u:p@127.0.0.1:5488/db")
  })

  it("returns undefined when nothing is configured", () => {
    expect(getTestDatabaseUrl()).toBeUndefined()
    expect(() => requireTestDatabaseUrl()).toThrow(/No test database configured/)
  })

  it("refuses a remote host by default", () => {
    setEnv({ DATABASE_URL: "postgres://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb" })
    expect(() => getTestDatabaseUrl()).toThrow(/Refusing to run tests against non-local database/)
    expect(() => assertSafeTestDatabaseUrl("postgres://u:p@db.example.com/x")).toThrow(
      /db\.example\.com/
    )
  })

  it("allows a remote host with the explicit override", () => {
    setEnv({
      DATABASE_URL: "postgres://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb",
      ALLOW_REMOTE_TEST_DATABASE: "true",
    })
    expect(getTestDatabaseUrl()).toContain("neon.tech")
  })
})
