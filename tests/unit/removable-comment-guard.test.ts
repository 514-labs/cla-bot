import { describe, expect, it } from "vitest"
import {
  CLA_BOT_COMMENT_SIGNATURE,
  isClaBotManagedComment,
} from "@/lib/pr-comment-template"

/**
 * Tests for the isRemovableClaPromptComment pattern used across the codebase.
 *
 * Three locations use this pattern:
 *   1. app/api/webhook/github/route.ts
 *   2. lib/cla/recheck-open-prs.ts
 *   3. workflows/signer-pr-sync.ts
 *
 * All three MUST first check isClaBotManagedComment() before checking text.
 * This test validates the guard pattern directly using the real implementation.
 */

function isRemovableClaPromptComment(commentBody: string) {
  if (!isClaBotManagedComment(commentBody)) return false
  return (
    commentBody.includes("Contributor License Agreement Required") ||
    commentBody.includes("Re-signing Required") ||
    commentBody.includes("CLA Bot is not configured for this repository")
  )
}

describe("isRemovableClaPromptComment guard pattern", () => {
  it("returns false for non-CLA-bot comments even with matching text", () => {
    const userComment = "Please sign the Contributor License Agreement Required for this project"
    expect(isRemovableClaPromptComment(userComment)).toBe(false)
  })

  it("returns false for non-CLA-bot comments mentioning re-signing", () => {
    const userComment = "Re-signing Required - please update your signature"
    expect(isRemovableClaPromptComment(userComment)).toBe(false)
  })

  it("returns true for CLA-bot managed comments with CLA Required text", () => {
    const botComment = `${CLA_BOT_COMMENT_SIGNATURE}\n### Contributor License Agreement Required\nPlease sign.`
    expect(isRemovableClaPromptComment(botComment)).toBe(true)
  })

  it("returns true for CLA-bot managed comments with Re-signing Required text", () => {
    const botComment = `${CLA_BOT_COMMENT_SIGNATURE}\n### CLA Re-signing Required\nPlease re-sign.`
    expect(isRemovableClaPromptComment(botComment)).toBe(true)
  })

  it("returns true for CLA-bot managed comments with unconfigured text", () => {
    const botComment = `${CLA_BOT_COMMENT_SIGNATURE}\nCLA Bot is not configured for this repository`
    expect(isRemovableClaPromptComment(botComment)).toBe(true)
  })

  it("returns false for CLA-bot managed comments without removable text", () => {
    const botComment = `${CLA_BOT_COMMENT_SIGNATURE}\n### CLA Signed\nAll good!`
    expect(isRemovableClaPromptComment(botComment)).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isRemovableClaPromptComment("")).toBe(false)
  })

  it("verifies signer-pr-sync.ts imports isClaBotManagedComment", async () => {
    // Read the module source to verify the import exists
    const fs = await import("node:fs")
    const source = fs.readFileSync("workflows/signer-pr-sync.ts", "utf-8")
    expect(source).toContain("isClaBotManagedComment")
    expect(source).toContain("if (!isClaBotManagedComment(commentBody)) return false")
  })
})
