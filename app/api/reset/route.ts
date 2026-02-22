import { NextResponse } from "next/server"
import { resetDatabase } from "@/lib/db/queries"
import { resetMockGitHub } from "@/lib/github"

/**
 * POST /api/reset
 * Resets both the app database and the mock GitHub state.
 * Used by end-to-end tests and the PR preview page.
 */
export async function POST() {
  await resetDatabase()
  resetMockGitHub()
  return NextResponse.json({ message: "Database and mock GitHub state reset" })
}
