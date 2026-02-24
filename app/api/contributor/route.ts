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
  const signaturesBySignedAtDesc = [...mySignatures].sort((a, b) =>
    b.signedAt.localeCompare(a.signedAt)
  )
  const orgById = new Map(allOrgs.map((org) => [org.id, org]))
  const latestSignatureByOrg = new Map<string, (typeof signaturesBySignedAtDesc)[number]>()
  const orgsWithCurrentSignature = new Set<string>()

  for (const sig of signaturesBySignedAtDesc) {
    if (!latestSignatureByOrg.has(sig.orgId)) {
      latestSignatureByOrg.set(sig.orgId, sig)
    }
    const org = orgById.get(sig.orgId)
    if (org && sig.claSha256 === org.claTextSha256) {
      orgsWithCurrentSignature.add(sig.orgId)
    }
  }

  // Enrich signatures with org data and status for latest vs history.
  const enriched = signaturesBySignedAtDesc.map((sig) => {
    const org = orgById.get(sig.orgId)
    const isCurrentVersion = sig.claSha256 === org?.claTextSha256
    const isLatestForOrg = latestSignatureByOrg.get(sig.orgId)?.id === sig.id
    const orgHasCurrentSignature = orgsWithCurrentSignature.has(sig.orgId)
    const orgNeedsResign = !orgHasCurrentSignature

    return {
      ...sig,
      orgName: org?.name ?? "Unknown",
      orgSlug: org?.githubOrgSlug ?? "",
      orgAvatarUrl: org?.avatarUrl ?? "",
      orgIsActive: org?.isActive ?? false,
      isCurrentVersion,
      isLatestForOrg,
      orgHasCurrentSignature,
      orgNeedsResign,
      signedVersionLabel: sig.claSha256.slice(0, 7),
    }
  })

  return NextResponse.json({
    user: toSessionUserDto(user),
    signatures: enriched,
    signedOrgCount: latestSignatureByOrg.size,
    outdatedOrgCount: [...latestSignatureByOrg.keys()].filter(
      (orgId) => !orgsWithCurrentSignature.has(orgId)
    ).length,
  })
}
