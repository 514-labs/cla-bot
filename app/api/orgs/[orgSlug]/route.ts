import { NextRequest, NextResponse } from "next/server"
import {
  getOrganizationBySlug,
  getSignaturesByOrg,
  updateOrganizationCla,
  getArchivesByOrg,
  setOrganizationActive,
} from "@/lib/db/queries"
import { getSessionUser } from "@/lib/auth"
import { isGitHubOrgAdmin } from "@/lib/github/admin-authorization"

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
