import { NextResponse } from "next/server"
import { getSignaturesByUser, getOrganizations } from "@/lib/db/queries"
import { getSessionUser } from "@/lib/auth"
import { toSessionUserDto } from "@/lib/session-user"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const mySignatures = await getSignaturesByUser(user.id)
  const allOrgs = await getOrganizations()

  // Enrich signatures with org data and version status
  const enriched = mySignatures.map((sig) => {
    const org = allOrgs.find((o) => o.id === sig.orgId)
    const isCurrentVersion = sig.claSha256 === org?.claTextSha256

    return {
      ...sig,
      orgName: org?.name ?? "Unknown",
      orgSlug: org?.githubOrgSlug ?? "",
      orgAvatarUrl: org?.avatarUrl ?? "",
      orgIsActive: org?.isActive ?? false,
      isCurrentVersion,
      signedVersionLabel: sig.claSha256.slice(0, 7),
    }
  })

  return NextResponse.json({ user: toSessionUserDto(user), signatures: enriched })
}
