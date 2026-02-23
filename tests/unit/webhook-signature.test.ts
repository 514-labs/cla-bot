import { describe, expect, it } from "vitest"
import { verifyGitHubWebhookSignature } from "@/lib/github/webhook-signature"

describe("verifyGitHubWebhookSignature", () => {
  it("matches GitHub's documented test vector", () => {
    const valid = verifyGitHubWebhookSignature({
      secret: "It's a Secret to Everybody",
      payload: "Hello, World!",
      signatureHeader: "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    })

    expect(valid).toBe(true)
  })

  it("accepts uppercase hex digests", () => {
    const valid = verifyGitHubWebhookSignature({
      secret: "It's a Secret to Everybody",
      payload: "Hello, World!",
      signatureHeader: "sha256=757107EA0EB2509FC211221CCE984B8A37570B6D7586C22C46F4379C8B043E17",
    })

    expect(valid).toBe(true)
  })

  it("rejects invalid signatures", () => {
    const valid = verifyGitHubWebhookSignature({
      secret: "It's a Secret to Everybody",
      payload: "Hello, World!",
      signatureHeader: "sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })

    expect(valid).toBe(false)
  })
})
