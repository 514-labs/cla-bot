import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { scheduleSignerPrSyncAfterSign } from "@/lib/cla/signer-pr-sync-scheduler"
import { SignClaError, resolveRequestEvidenceFromHeaders, signClaForUser } from "@/lib/cla/signing"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { orgSlug, repoName, prNumber, acceptedSha256, assented, consentTextVersion } = body as {
    orgSlug?: string
    repoName?: string
    prNumber?: number | string
    acceptedSha256?: string
    assented?: boolean
    consentTextVersion?: string
  }

  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await signClaForUser({
      orgSlug: orgSlug ?? "",
      user,
      repoName,
      prNumber,
      acceptedSha256,
      assented,
      consentTextVersion,
      requestEvidence: resolveRequestEvidenceFromHeaders(request.headers),
    })
    const scheduleResult = await scheduleSignerPrSyncAfterSign({
      signResult: result,
      actor: {
        userId: user.id,
        githubId: user.githubId ?? null,
        githubUsername: user.githubUsername ?? null,
      },
    })

    return NextResponse.json({
      signature: result.signature,
      ...scheduleResult,
    })
  } catch (error) {
    if (error instanceof SignClaError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.details ?? {}),
        },
        { status: error.status }
      )
    }

    console.error("Failed to sign CLA:", error)
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 })
  }
}
