import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyGitHubWebhookSignature(params: {
  secret: string
  payload: string
  signatureHeader: string | null
}): boolean {
  const { secret, payload, signatureHeader } = params
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false

  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signatureHeader)

  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}
