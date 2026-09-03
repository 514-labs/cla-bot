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

function isDisabled() {
  return process.env.NODE_ENV === "production"
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
      await resetDatabase()
      resetMockGitHub()
      resetDbQueryStats()
      return NextResponse.json({ ok: true, action: body.action })
    }
    case "configure-github": {
      configureMockGitHub({ latencyMs: body.latencyMs, failures: body.failures })
      return NextResponse.json({ ok: true, action: body.action, config: getMockGitHubConfig() })
    }
    default:
      return NextResponse.json(
        { error: "Unknown action. Expected one of: reset, reset-db, configure-github" },
        { status: 400 }
      )
  }
}
