/**
 * Compute the SHA-256 hex digest of a string.
 * Uses Web Crypto API for broad environment compatibility
 * (Node.js, edge runtime, workers, etc.).
 */
export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
