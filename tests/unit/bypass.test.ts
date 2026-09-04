import { describe, expect, it } from "vitest"
import {
  parseBypassKind,
  normalizeBypassUsername,
  normalizeBypassActorSlug,
  formatBypassActorLogin,
  getBypassActorLoginCandidates,
  isLikelyAppBotActor,
  selectBypassAccount,
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
    expect(getBypassActorLoginCandidates("dependabot")).toEqual(["dependabot", "dependabot[bot]"])
  })

  it("returns both for bot input with [bot] suffix", () => {
    expect(getBypassActorLoginCandidates("renovate[bot]")).toEqual(["renovate", "renovate[bot]"])
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

describe("selectBypassAccount", () => {
  const accounts = [
    {
      bypassKind: "user" as const,
      githubUserId: "1004",
      githubUsername: "new-contributor",
      actorSlug: null,
    },
    {
      bypassKind: "user" as const,
      githubUserId: "9999",
      githubUsername: "Renamed-User",
      actorSlug: null,
    },
    {
      bypassKind: "app_bot" as const,
      githubUserId: null,
      githubUsername: "dependabot[bot]",
      actorSlug: "dependabot",
    },
    {
      bypassKind: "app_bot" as const,
      githubUserId: null,
      githubUsername: "renovate",
      actorSlug: null,
    },
  ]

  it("prefers the immutable GitHub id over the login", () => {
    const match = selectBypassAccount(accounts, {
      githubUserId: 1004,
      githubUsername: "someone-else",
    })
    expect(match?.githubUsername).toBe("new-contributor")
  })

  it("falls back to a case-insensitive login match for user entries", () => {
    const match = selectBypassAccount(accounts, {
      githubUserId: 1,
      githubUsername: "@renamed-user",
    })
    expect(match?.githubUserId).toBe("9999")
  })

  it("matches app/bot entries by actor slug with or without the [bot] suffix", () => {
    expect(selectBypassAccount(accounts, { githubUsername: "dependabot[bot]" })?.actorSlug).toBe(
      "dependabot"
    )
    expect(selectBypassAccount(accounts, { githubUsername: "dependabot" })?.actorSlug).toBe(
      "dependabot"
    )
  })

  it("matches app/bot entries by stored login candidates", () => {
    expect(selectBypassAccount(accounts, { githubUsername: "renovate[bot]" })?.githubUsername).toBe(
      "renovate"
    )
  })

  it("returns null when nothing matches or the author is anonymous", () => {
    expect(
      selectBypassAccount(accounts, { githubUserId: 1006, githubUsername: "external" })
    ).toBeNull()
    expect(selectBypassAccount(accounts, {})).toBeNull()
    expect(selectBypassAccount([], { githubUserId: 1004 })).toBeNull()
  })

  it("does not let a user entry's login match an app/bot lookup or vice versa", () => {
    const mixed = [
      {
        bypassKind: "app_bot" as const,
        githubUserId: null,
        githubUsername: "new-contributor",
        actorSlug: null,
      },
    ]
    // login matches only via the app_bot candidate path, which is still a valid bypass
    expect(selectBypassAccount(mixed, { githubUsername: "new-contributor" })?.bypassKind).toBe(
      "app_bot"
    )
    // but a user-kind id lookup never matches an app_bot row
    expect(selectBypassAccount(mixed, { githubUserId: 1004 })).toBeNull()
  })
})
