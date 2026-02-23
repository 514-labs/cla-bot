import { NextRequest, NextResponse } from "next/server"
import { getOrganizationBySlug, getSignatureStatus } from "@/lib/db/queries"
import { getSessionUser } from "@/lib/auth"

/**
 * GET /api/sign/:orgSlug
 * Returns org details + whether the current user has signed the CURRENT CLA.
 * Comparison is sha256-based: signature.claSha256 vs org.claTextSha256.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const org = await getOrganizationBySlug(orgSlug)

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const status = await getSignatureStatus(orgSlug, user.id)

  return NextResponse.json({
    org: {
      ...org,
      claMarkdown: org.claText,
    },
    user,
    alreadySigned: status.signed && status.currentVersion,
    needsResign: status.signed && !status.currentVersion,
    signature: status.signature ?? null,
    currentSha256: org.claTextSha256,
    signedSha256: status.signature?.claSha256 ?? null,
  })
}
