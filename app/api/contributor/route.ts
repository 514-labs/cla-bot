import { NextResponse } from "next/server"
import {
  getSessionUser,
  getSignaturesByUser,
  getOrganizations,
} from "@/lib/db/queries"

export async function GET() {
  const user = getSessionUser()
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

  return NextResponse.json({ user, signatures: enriched })
}
