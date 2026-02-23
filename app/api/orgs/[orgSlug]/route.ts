import { NextRequest, NextResponse } from "next/server"
import {
  getOrganizationBySlug,
  getSignaturesByOrg,
  updateOrganizationCla,
  getArchivesByOrg,
  setOrganizationActive,
  createAuditEvent,
} from "@/lib/db/queries"
import { getSessionUser } from "@/lib/auth"
import { isGitHubOrgAdmin } from "@/lib/github/admin-authorization"
import { recheckOpenPullRequestsAfterClaUpdate } from "@/lib/cla/recheck-open-prs"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const auth = await authorizeOrgAccess(orgSlug)
  if ("error" in auth) return auth.error
  const { org } = auth

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
  const auth = await authorizeOrgAccess(orgSlug)
  if ("error" in auth) return auth.error

  const body = await request.json()

  // Handle active toggle
  if (typeof body.isActive === "boolean") {
    const org = await setOrganizationActive(orgSlug, body.isActive)
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }
    await createAuditEvent({
      eventType: "organization.activation_changed",
      orgId: org.id,
      userId: auth.user.id,
      actorGithubId: auth.user.githubId ?? null,
      actorGithubUsername: auth.user.githubUsername,
      payload: { isActive: body.isActive },
    })
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

  const appBaseUrl = getBaseUrl(request)
  const recheckSummary = await recheckOpenPullRequestsAfterClaUpdate({
    orgSlug,
    appBaseUrl,
    installationId: org.installationId ?? undefined,
  })

  await createAuditEvent({
    eventType: "cla.updated",
    orgId: org.id,
    userId: auth.user.id,
    actorGithubId: auth.user.githubId ?? null,
    actorGithubUsername: auth.user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      recheckSummary,
    },
  })

  return NextResponse.json({ org, recheckSummary })
}

async function authorizeOrgAccess(orgSlug: string) {
  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    return {
      error: NextResponse.json({ error: "Organization not found" }, { status: 404 }),
    }
  }

  const user = await getSessionUser()
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return { org, user }
  }

  try {
    const isAdmin = await isGitHubOrgAdmin(user, orgSlug)
    if (!isAdmin) {
      return {
        error: NextResponse.json(
          { error: "Forbidden: GitHub org admin access required" },
          { status: 403 }
        ),
      }
    }
  } catch (err) {
    console.error("GitHub org-admin verification failed:", err)
    return {
      error: NextResponse.json(
        { error: "Failed to verify GitHub org admin access" },
        { status: 502 }
      ),
    }
  }

  return { org, user }
}

function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}
