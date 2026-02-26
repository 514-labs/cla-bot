import { describe, expect, it } from "vitest"
import {
  parseBypassKind,
  normalizeBypassUsername,
  normalizeBypassActorSlug,
  formatBypassActorLogin,
  getBypassActorLoginCandidates,
  isLikelyAppBotActor,
} from "@/lib/bypass"

describe("parseBypassKind", () => {
  it("returns 'user' for valid user kind", () => {
    expect(parseBypassKind("user")).toBe("user")
  })

  it("returns 'app_bot' for valid app_bot kind", () => {
    expect(parseBypassKind("app_bot")).toBe("app_bot")
  })

  it("returns null for invalid string", () => {
    expect(parseBypassKind("invalid")).toBeNull()
  })

  it("returns null for non-string values", () => {
    expect(parseBypassKind(42)).toBeNull()
    expect(parseBypassKind(null)).toBeNull()
    expect(parseBypassKind(undefined)).toBeNull()
    expect(parseBypassKind({})).toBeNull()
  })
})

describe("normalizeBypassUsername", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeBypassUsername("  UserName  ")).toBe("username")
  })

  it("strips leading @", () => {
    expect(normalizeBypassUsername("@orgadmin")).toBe("orgadmin")
  })

  it("handles empty string", () => {
    expect(normalizeBypassUsername("")).toBe("")
  })
})

describe("normalizeBypassActorSlug", () => {
  it("strips [bot] suffix", () => {
    expect(normalizeBypassActorSlug("dependabot[bot]")).toBe("dependabot")
  })

  it("returns normalized name if no bot suffix", () => {
    expect(normalizeBypassActorSlug("myuser")).toBe("myuser")
  })

  it("returns empty string for empty input", () => {
    expect(normalizeBypassActorSlug("")).toBe("")
  })

  it("strips @ and [bot] suffix", () => {
    expect(normalizeBypassActorSlug("@renovate[bot]")).toBe("renovate")
  })
})

describe("formatBypassActorLogin", () => {
  it("appends [bot] suffix to normalized slug", () => {
    expect(formatBypassActorLogin("dependabot")).toBe("dependabot[bot]")
  })

  it("doesn't double-add [bot] suffix", () => {
    expect(formatBypassActorLogin("dependabot[bot]")).toBe("dependabot[bot]")
  })

  it("returns empty string for empty input", () => {
    expect(formatBypassActorLogin("")).toBe("")
  })
})

describe("getBypassActorLoginCandidates", () => {
  it("returns both slug and login for regular user", () => {
    expect(getBypassActorLoginCandidates("dependabot")).toEqual([
      "dependabot",
      "dependabot[bot]",
    ])
  })

  it("returns both for bot input with [bot] suffix", () => {
    expect(getBypassActorLoginCandidates("renovate[bot]")).toEqual([
      "renovate",
      "renovate[bot]",
    ])
  })

  it("returns empty array for empty input", () => {
    expect(getBypassActorLoginCandidates("")).toEqual([])
  })
})

describe("isLikelyAppBotActor", () => {
  it("returns true for type Bot", () => {
    expect(isLikelyAppBotActor({ login: "mybot", type: "Bot" })).toBe(true)
  })

  it("returns true for login ending with [bot]", () => {
    expect(isLikelyAppBotActor({ login: "dependabot[bot]" })).toBe(true)
  })

  it("returns true for login containing dependabot", () => {
    expect(isLikelyAppBotActor({ login: "dependabot" })).toBe(true)
  })

  it("returns false for regular user", () => {
    expect(isLikelyAppBotActor({ login: "orgadmin", type: "User" })).toBe(false)
  })

  it("returns false for regular user without type", () => {
    expect(isLikelyAppBotActor({ login: "contributor1" })).toBe(false)
  })
})
