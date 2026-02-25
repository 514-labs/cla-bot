import { describe, expect, it } from "vitest"
import {
  CLA_BOT_COMMENT_SIGNATURE,
  generateUnsignedComment,
  isClaBotManagedComment,
} from "@/lib/pr-comment-template"

describe("PR comment template ownership marker", () => {
  it("adds CLA-bot signature marker to generated unsigned comments", () => {
    const markdown = generateUnsignedComment({
      prAuthor: "contributor1",
      orgName: "Fiveonefour",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 42,
      claVersionLabel: "abc1234",
      appBaseUrl: "https://cla.fiveonefour.com",
      isResign: false,
    })

    expect(markdown.startsWith(CLA_BOT_COMMENT_SIGNATURE)).toBe(true)
    expect(isClaBotManagedComment(markdown)).toBe(true)
  })
})
