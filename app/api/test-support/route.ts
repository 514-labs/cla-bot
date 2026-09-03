/**
 * Dev/test-only introspection and control endpoint.
 *
 * Hard-disabled in production (404). Used by the integration suite and by
 * `pnpm dev:local` workflows to:
 *   - read the mock GitHub client's call log, check runs and comments
 *   - read the Drizzle statement counter (round trips per request)
 *   - reset that in-memory state between tests
 *   - inject latency / failures into the mock GitHub client
 *   - truncate + re-seed the local database
 *
 * The test runner and the Next.js server are separate processes, so this is
 * the only reliable way for tests to observe or reset server-side memory.
 */

import { type NextRequest, NextResponse } from "next/server"
import { databaseHostForDisplay, isLocalDatabaseUrl } from "@/lib/db/database-url"
import { resetDatabase } from "@/lib/db/queries"
import { getDbQueryStats, resetDbQueryStats } from "@/lib/db/query-stats"
import {
  configureMockGitHub,
  getAllCheckRuns,
  getAllComments,
  getMockGitHubCallLog,
  getMockGitHubConfig,
  resetMockGitHub,
} from "@/lib/github"

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

/**
 * Two independent gates, both required:
 *  - never in production builds
 *  - only when the process was started with ENABLE_TEST_SUPPORT=true, which the
 *    integration server and `pnpm dev:local` set. A plain `pnpm dev` does not,
 *    so a developer pointed at a shared database cannot trip this by accident.
 */
function isDisabled() {
  return process.env.NODE_ENV === "production" || process.env.ENABLE_TEST_SUPPORT !== "true"
}

export async function GET() {
  if (isDisabled()) return notFound()

  const db = getDbQueryStats()
  return NextResponse.json({
    github: {
      calls: getMockGitHubCallLog(),
      checkRuns: getAllCheckRuns(),
      comments: getAllComments(),
      config: getMockGitHubConfig(),
    },
    db,
  })
}

type Action = "reset" | "reset-db" | "configure-github"

type Body = {
  action?: Action
  latencyMs?: number
  failures?: Record<string, { status?: number; message?: string; times?: number } | null>
}

export async function POST(request: NextRequest) {
  if (isDisabled()) return notFound()

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  switch (body.action) {
    case "reset": {
      resetMockGitHub()
      resetDbQueryStats()
      return NextResponse.json({ ok: true, action: body.action })
    }
    case "reset-db": {
      // Truncates every table: refuse unless the database is on this machine.
      const databaseUrl = process.env.DATABASE_URL
      if (!isLocalDatabaseUrl(databaseUrl)) {
        return NextResponse.json(
          {
            error: `Refusing to reset non-local database host "${databaseHostForDisplay(databaseUrl)}"`,
          },
          { status: 403 }
        )
      }
      await resetDatabase()
      resetMockGitHub()
      resetDbQueryStats()
      return NextResponse.json({ ok: true, action: body.action })
    }
    case "configure-github": {
      try {
        configureMockGitHub({ latencyMs: body.latencyMs, failures: body.failures })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message }, { status: 400 })
      }
      return NextResponse.json({ ok: true, action: body.action, config: getMockGitHubConfig() })
    }
    default:
      return NextResponse.json(
        { error: "Unknown action. Expected one of: reset, reset-db, configure-github" },
        { status: 400 }
      )
  }
}
