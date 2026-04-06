import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

export function verifyGitHubWebhookSignature(params: {
  secret: string
  payload: string
  signatureHeader: string | null
}): boolean {
  const { secret, payload, signatureHeader } = params
  if (!signatureHeader) return false

  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim())
  if (!match) return false

  const receivedDigest = Buffer.from(match[1], "hex")
  const expectedDigest = createHmac("sha256", secret).update(payload, "utf8").digest()

  if (expectedDigest.length !== receivedDigest.length) return false
  return timingSafeEqual(expectedDigest, receivedDigest)
}

/**
 * Verify an incoming webhook request against a named env-var secret.
 * Returns a NextResponse error if verification fails, or null if OK.
 */
export function verifyWebhookSignatureFromEnv(
  rawPayload: string,
  signatureHeader: string | null,
  secretEnvVar: string
): NextResponse | null {
  const configuredSecret = process.env[secretEnvVar]
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: `${secretEnvVar} is not configured` }, { status: 500 })
    }
    return null
  }

  const secret = normalizeWebhookSecret(configuredSecret)
  if (!signatureHeader) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Missing x-hub-signature-256 header" }, { status: 401 })
    }
    return null
  }

  const valid = verifyGitHubWebhookSignature({
    secret,
    payload: rawPayload,
    signatureHeader: signatureHeader.trim(),
  })
  if (!valid) {
    return NextResponse.json(
      {
        error: `Invalid webhook signature. Ensure ${secretEnvVar} exactly matches the secret configured in GitHub.`,
      },
      { status: 401 }
    )
  }

  return null
}

function normalizeWebhookSecret(secret: string): string {
  const trimmed = secret.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
