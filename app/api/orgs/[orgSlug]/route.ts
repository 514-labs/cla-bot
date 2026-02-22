import { NextRequest, NextResponse } from "next/server"
import {
  getOrganizationBySlug,
  getSignaturesByOrg,
  updateOrganizationCla,
  getArchivesByOrg,
  setOrganizationActive,
} from "@/lib/db/queries"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }
  const signers = await getSignaturesByOrg(org.id)
  const archives = await getArchivesByOrg(org.id)

  return NextResponse.json({
    org,
    signers,
    archives,
    currentClaMarkdown: org.claText,
    currentClaSha256: org.claTextSha256,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const body = await request.json()

  // Handle active toggle
  if (typeof body.isActive === "boolean") {
    const org = await setOrganizationActive(orgSlug, body.isActive)
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }
    return NextResponse.json({ org })
  }

  // Handle CLA text update -- just overwrites text + sha256, no archive created
  const { claMarkdown } = body
  if (typeof claMarkdown !== "string") {
    return NextResponse.json({ error: "claMarkdown or isActive is required" }, { status: 400 })
  }

  const org = await updateOrganizationCla(orgSlug, claMarkdown)
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  return NextResponse.json({ org })
}
