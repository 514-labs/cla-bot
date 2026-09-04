import { describe, expect, it } from "vitest"
import {
  buildClaSignUrl,
  CLA_BOT_COMMENT_SIGNATURE,
  generateUnsignedComment,
  isClaBotManagedComment,
} from "@/lib/pr-comment-template"

describe("buildClaSignUrl", () => {
  it("builds the PR-scoped sign URL with the given attribution medium", () => {
    expect(
      buildClaSignUrl({
        appBaseUrl: "https://cla.fiveonefour.com",
        orgSlug: "fiveonefour",
        repoName: "my repo",
        prNumber: 42,
        medium: "check_run",
      })
    ).toBe(
      "https://cla.fiveonefour.com/sign/fiveonefour?repo=my%20repo&pr=42&utm_source=github&utm_medium=check_run&utm_campaign=cla_bot"
    )
  })

  it("is the same link the unsigned comment points at", () => {
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
    const commentUrl = buildClaSignUrl({
      appBaseUrl: "https://cla.fiveonefour.com",
      orgSlug: "fiveonefour",
      repoName: "sdk",
      prNumber: 42,
      medium: "pr_comment",
    })
    expect(markdown).toContain(`[Sign the CLA](${commentUrl})`)
  })
})

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
