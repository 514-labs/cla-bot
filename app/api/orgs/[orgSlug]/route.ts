import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import {
  createAuditEvent,
  getArchivesByOrg,
  getSignaturesByOrg,
  setOrganizationActive,
  updateOrganizationCla,
} from "@/lib/db/queries"
import { recheckOpenPullRequestsAfterClaUpdate } from "@/lib/cla/recheck-open-prs"
import { getBaseUrlFromHeaders } from "@/lib/cla/signing"
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
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status })
  }

  const body = await request.json()

  if (typeof body.isActive === "boolean") {
    const org = await setOrganizationActive(orgSlug, body.isActive)
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    await createAuditEvent({
      eventType: "organization.activation_changed",
      orgId: org.id,
      userId: access.user.id,
      actorGithubId: access.user.githubId ?? null,
      actorGithubUsername: access.user.githubUsername,
      payload: { isActive: body.isActive },
    })

    return NextResponse.json({ org })
  }

  const { claMarkdown } = body
  if (typeof claMarkdown !== "string") {
    return NextResponse.json({ error: "claMarkdown or isActive is required" }, { status: 400 })
  }
  if (claMarkdown.trim().length === 0) {
    return NextResponse.json({ error: "CLA text cannot be empty" }, { status: 400 })
  }

  const org = await updateOrganizationCla(orgSlug, claMarkdown)
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const headerStore = await headers()
  const recheckSummary = await recheckOpenPullRequestsAfterClaUpdate({
    orgSlug,
    appBaseUrl: getBaseUrlFromHeaders(headerStore),
    installationId: org.installationId ?? undefined,
  })

  await createAuditEvent({
    eventType: "cla.updated",
    orgId: org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      recheckSummary,
    },
  })

  return NextResponse.json({ org, recheckSummary })
}
