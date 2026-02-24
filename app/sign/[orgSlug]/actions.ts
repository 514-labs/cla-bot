"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSessionUser } from "@/lib/auth"
import {
  SignClaError,
  getBaseUrlFromHeaders,
  resolveRequestEvidenceFromHeaders,
  signClaForUser,
} from "@/lib/cla/signing"

const signSchema = z.object({
  orgSlug: z.string().min(1),
  repoName: z.string().optional().nullable(),
  prNumber: z.union([z.number(), z.string()]).optional().nullable(),
  acceptedSha256: z.string().min(1),
})

type SignActionResult = {
  ok: boolean
  error?: string
  currentSha256?: string
}

export async function signClaAction(input: unknown): Promise<SignActionResult> {
  const user = await getSessionUser()
  if (!user) {
    return { ok: false, error: "Unauthorized" }
  }

  const parsed = signSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  const headerStore = await headers()

  try {
    await signClaForUser({
      ...parsed.data,
      user,
      assented: true,
      consentTextVersion: "v1",
      requestEvidence: resolveRequestEvidenceFromHeaders(headerStore),
      appBaseUrl: getBaseUrlFromHeaders(headerStore),
    })

    revalidatePath(`/sign/${parsed.data.orgSlug}`)
    revalidatePath("/contributor")

    return { ok: true }
  } catch (error) {
    if (error instanceof SignClaError) {
      return {
        ok: false,
        error: error.message,
        currentSha256:
          typeof error.details?.currentSha256 === "string"
            ? error.details.currentSha256
            : undefined,
      }
    }

    console.error("Failed to sign CLA in server action:", error)
    return { ok: false, error: "Unexpected server error" }
  }
}
