import { NextResponse } from "next/server"
import { resetDatabase } from "@/lib/db/queries"
import { resetMockGitHub } from "@/lib/github"
import { setCurrentRole } from "@/lib/mock-db"

/**
 * POST /api/reset
 * Resets both the app database and the mock GitHub state.
 * Used by end-to-end tests and the PR preview page.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await resetDatabase()
  resetMockGitHub()
  setCurrentRole("admin")
  return NextResponse.json({ message: "Database and mock GitHub state reset" })
}
