import { NextRequest, NextResponse } from "next/server"
import { getArchivesByOrg, getSignaturesByOrg } from "@/lib/db/queries"
import { authorizeOrgAccess } from "@/lib/server/org-access"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status })
  }

  const { org } = access
  const [signers, archives] = await Promise.all([
    getSignaturesByOrg(org.id),
    getArchivesByOrg(org.id),
  ])

  return NextResponse.json({
    org,
    signers,
    archives,
    currentClaMarkdown: org.claText,
    currentClaSha256: org.claTextSha256,
  })
}

export async function PATCH(
  _request: NextRequest,
  _context: { params: Promise<{ orgSlug: string }> }
) {
  return NextResponse.json(
    { error: "PATCH /api/orgs/[orgSlug] is disabled. Use server actions from /admin." },
    {
      status: 405,
      headers: {
        Allow: "GET",
      },
    }
  )
}
