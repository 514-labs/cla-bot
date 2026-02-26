import { describe, expect, it } from "vitest"
import { buildFiveonefourUrl } from "@/lib/marketing-links"

describe("buildFiveonefourUrl", () => {
  it("builds URL with required medium parameter", () => {
    const url = buildFiveonefourUrl({ medium: "github_pr_comment" })
    expect(url).toContain("utm_source=cla_bot")
    expect(url).toContain("utm_medium=github_pr_comment")
    expect(url).toContain("utm_campaign=fiveonefour_referral")
    expect(url).toContain("fiveonefour.com")
  })

  it("includes content parameter when provided", () => {
    const url = buildFiveonefourUrl({ medium: "test", content: "branding_signed" })
    expect(url).toContain("utm_content=branding_signed")
  })

  it("omits content parameter when not provided", () => {
    const url = buildFiveonefourUrl({ medium: "test" })
    expect(url).not.toContain("utm_content")
  })

  it("allows custom campaign", () => {
    const url = buildFiveonefourUrl({ medium: "test", campaign: "custom_campaign" })
    expect(url).toContain("utm_campaign=custom_campaign")
  })
})
