import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { getArchiveByOrgAndSha, getOrganizationById, getSignatureById } from "@/lib/db/queries"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ signatureId: string }> }
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { signatureId } = await params
  const signature = await getSignatureById(signatureId)
  if (!signature || signature.userId !== user.id) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 })
  }

  const org = await getOrganizationById(signature.orgId)
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const archive = await getArchiveByOrgAndSha(signature.orgId, signature.claSha256)
  const markdown =
    archive?.claText ?? (org.claTextSha256 === signature.claSha256 ? org.claText : null)
  if (!markdown) {
    return NextResponse.json({ error: "CLA archive not found" }, { status: 404 })
  }

  const fileName = buildClaFileName({
    orgSlug: org.githubOrgSlug,
    version: signature.claSha256.slice(0, 7),
    signedAt: signature.signedAt,
  })

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  })
}

function buildClaFileName(params: { orgSlug: string; version: string; signedAt: string }) {
  const safeSlug = sanitizeFilePart(params.orgSlug)
  const safeVersion = sanitizeFilePart(params.version)
  const safeDate = sanitizeFilePart(params.signedAt.slice(0, 10))
  return `${safeSlug}-cla-${safeVersion}-${safeDate}.md`
}

function sanitizeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
}
