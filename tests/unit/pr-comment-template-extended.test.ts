import { describe, expect, it } from "vitest"
import {
  CLA_BOT_COMMENT_SIGNATURE,
  isClaBotManagedComment,
  generateUnsignedComment,
  generateSignedComment,
  generateInactiveComment,
} from "@/lib/pr-comment-template"

describe("isClaBotManagedComment", () => {
  it("returns true for comment with signature", () => {
    expect(isClaBotManagedComment(`${CLA_BOT_COMMENT_SIGNATURE}\nSome content`)).toBe(true)
  })

  it("returns false for comment without signature", () => {
    expect(isClaBotManagedComment("Regular comment")).toBe(false)
  })
})

describe("generateUnsignedComment", () => {
  const baseParams = {
    prAuthor: "contributor1",
    orgName: "Fiveonefour",
    orgSlug: "fiveonefour",
    repoName: "sdk",
    prNumber: 42,
    claVersionLabel: "abc1234",
    appBaseUrl: "https://cla.fiveonefour.com",
    isResign: false,
  }

  it("generates unsigned comment with correct signature marker", () => {
    const comment = generateUnsignedComment(baseParams)
    expect(comment.startsWith(CLA_BOT_COMMENT_SIGNATURE)).toBe(true)
    expect(isClaBotManagedComment(comment)).toBe(true)
  })

  it("includes PR author mention", () => {
    const comment = generateUnsignedComment(baseParams)
    expect(comment).toContain("@contributor1")
  })

  it("includes org name", () => {
    const comment = generateUnsignedComment(baseParams)
    expect(comment).toContain("**Fiveonefour**")
  })

  it("includes sign URL with repo and PR params", () => {
    const comment = generateUnsignedComment(baseParams)
    expect(comment).toContain("/sign/fiveonefour?repo=sdk&pr=42")
  })

  it("generates re-sign comment when isResign is true", () => {
    const comment = generateUnsignedComment({ ...baseParams, isResign: true })
    expect(comment).toContain("CLA Re-signing Required")
    expect(comment).toContain("version `abc1234`")
    expect(comment).not.toContain("Contributor License Agreement Required")
  })

  it("generates initial sign comment when isResign is false", () => {
    const comment = generateUnsignedComment(baseParams)
    expect(comment).toContain("Contributor License Agreement Required")
    expect(comment).not.toContain("CLA Re-signing Required")
  })

  it("includes branding footer", () => {
    const comment = generateUnsignedComment(baseParams)
    expect(comment).toContain("fiveonefour.com")
    expect(comment).toContain("CLA Bot")
  })
})

describe("generateSignedComment", () => {
  const baseParams = {
    prAuthor: "contributor1",
    orgName: "Fiveonefour",
    claVersionLabel: "abc1234",
    appBaseUrl: "https://cla.fiveonefour.com",
  }

  it("generates signed comment with signature marker", () => {
    const comment = generateSignedComment(baseParams)
    expect(comment.startsWith(CLA_BOT_COMMENT_SIGNATURE)).toBe(true)
  })

  it("includes CLA Signed header", () => {
    const comment = generateSignedComment(baseParams)
    expect(comment).toContain("### CLA Signed")
  })

  it("includes author mention and org name", () => {
    const comment = generateSignedComment(baseParams)
    expect(comment).toContain("@contributor1")
    expect(comment).toContain("**Fiveonefour**")
  })

  it("includes version label", () => {
    const comment = generateSignedComment(baseParams)
    expect(comment).toContain("`abc1234`")
  })

  it("includes signed branding footer", () => {
    const comment = generateSignedComment(baseParams)
    expect(comment).toContain("cla_bot_signed")
  })
})

describe("generateInactiveComment", () => {
  const baseParams = {
    prAuthor: "contributor1",
    orgName: "Fiveonefour",
    appBaseUrl: "https://cla.fiveonefour.com",
  }

  it("generates inactive comment with signature marker", () => {
    const comment = generateInactiveComment(baseParams)
    expect(comment.startsWith(CLA_BOT_COMMENT_SIGNATURE)).toBe(true)
  })

  it("includes CLA Check Skipped header", () => {
    const comment = generateInactiveComment(baseParams)
    expect(comment).toContain("### CLA Check Skipped")
  })

  it("mentions author and org", () => {
    const comment = generateInactiveComment(baseParams)
    expect(comment).toContain("@contributor1")
    expect(comment).toContain("**Fiveonefour**")
  })

  it("includes inactive branding footer", () => {
    const comment = generateInactiveComment(baseParams)
    expect(comment).toContain("cla_bot_inactive")
  })
})
