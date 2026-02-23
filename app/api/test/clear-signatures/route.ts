import { NextResponse } from "next/server"
import { clearSignaturesForUser } from "@/lib/db/queries"

/**
 * POST /api/test/clear-signatures
 * Test helper: remove all CLA signatures for a user on an org.
 * Only used in preview/testing.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { orgSlug, githubUsername } = await request.json()
  if (!orgSlug || !githubUsername) {
    return NextResponse.json({ error: "orgSlug and githubUsername are required" }, { status: 400 })
  }
  const removed = await clearSignaturesForUser(orgSlug, githubUsername)
  return NextResponse.json({ removed, orgSlug, githubUsername })
}
