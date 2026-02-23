import { createHmac, timingSafeEqual } from "node:crypto"

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
