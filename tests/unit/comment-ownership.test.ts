import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  findLatestManagedClaBotComment,
  findOwnedClaBotComment,
  getExpectedBotLogin,
  isManagedClaBotComment,
  resetCommentOwnershipWarnings,
} from "@/lib/github/comment-ownership"
import type { GitHubUser, IssueComment } from "@/lib/github/types"
import { CLA_BOT_COMMENT_SIGNATURE } from "@/lib/pr-comment-template"

const APP_SLUG = "cla-bot-by-fiveonefour"

const OUR_BOT: GitHubUser = {
  login: `${APP_SLUG}[bot]`,
  id: 101010,
  avatar_url: "https://avatars.githubusercontent.com/in/1",
  html_url: `https://github.com/apps/${APP_SLUG}`,
  type: "Bot",
}

const ATTACKER: GitHubUser = {
  login: "mallory",
  id: 4242,
  avatar_url: "https://avatars.githubusercontent.com/u/4242",
  html_url: "https://github.com/mallory",
  type: "User",
}

const MANAGED_BODY = `${CLA_BOT_COMMENT_SIGNATURE}\n### Contributor License Agreement Required`

function makeComment(overrides: Partial<IssueComment> = {}): IssueComment {
  return {
    id: 1,
    body: "regular comment",
    user: {
      login: "someone",
      id: 2,
      avatar_url: "https://avatars.githubusercontent.com/u/2",
      html_url: "https://github.com/someone",
      type: "Bot",
    },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    html_url: "https://github.com/test/test/pull/1#issuecomment-1",
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv("GITHUB_APP_SLUG", APP_SLUG)
  vi.stubEnv("GITHUB_APP_ID", "")
  resetCommentOwnershipWarnings()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("getExpectedBotLogin", () => {
  it("derives the bot login from GITHUB_APP_SLUG", () => {
    expect(getExpectedBotLogin()).toBe(`${APP_SLUG}[bot]`)
  })

  it("returns null and warns once when GITHUB_APP_SLUG is unset", () => {
    vi.stubEnv("GITHUB_APP_SLUG", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    expect(getExpectedBotLogin()).toBeNull()
    expect(getExpectedBotLogin()).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("GITHUB_APP_SLUG")
  })
})

describe("findLatestManagedClaBotComment", () => {
  it("ignores bot comments that are not CLA-bot managed", () => {
    const vercelComment = makeComment({
      id: 11,
      body: "Vercel preview deployed",
      user: {
        login: "vercel[bot]",
        id: 19864447,
        avatar_url: "https://avatars.githubusercontent.com/in/35677",
        html_url: "https://github.com/apps/vercel",
        type: "Bot",
      },
    })

    expect(findLatestManagedClaBotComment([vercelComment])).toBeNull()
  })

  it("ignores marker comments from other bots", () => {
    const otherBot = makeComment({
      id: 12,
      body: MANAGED_BODY,
      user: {
        login: "dependabot[bot]",
        id: 49699333,
        avatar_url: "https://avatars.githubusercontent.com/in/29110",
        html_url: "https://github.com/apps/dependabot",
        type: "Bot",
      },
    })

    expect(findLatestManagedClaBotComment([otherBot])).toBeNull()
  })

  it("returns the latest CLA-bot authored comment carrying the marker", () => {
    const externalBotComment = makeComment({
      id: 21,
      body: "Dependabot dependency update",
      user: {
        login: "dependabot[bot]",
        id: 49699333,
        avatar_url: "https://avatars.githubusercontent.com/in/29110",
        html_url: "https://github.com/apps/dependabot",
        type: "Bot",
      },
    })
    const oldManagedComment = makeComment({ id: 22, body: MANAGED_BODY, user: OUR_BOT })
    const latestManagedComment = makeComment({
      id: 23,
      body: `${CLA_BOT_COMMENT_SIGNATURE}\n### CLA Re-signing Required`,
      user: OUR_BOT,
    })

    const result = findLatestManagedClaBotComment([
      externalBotComment,
      oldManagedComment,
      latestManagedComment,
    ])
    expect(result?.id).toBe(23)
  })

  it("matches the bot login case-insensitively", () => {
    const comment = makeComment({
      id: 24,
      body: MANAGED_BODY,
      user: { ...OUR_BOT, login: `${APP_SLUG.toUpperCase()}[BOT]` },
    })

    expect(findLatestManagedClaBotComment([comment])?.id).toBe(24)
  })

  it("ignores a User-authored comment that pastes the marker", () => {
    const forged = makeComment({ id: 31, body: MANAGED_BODY, user: ATTACKER })

    expect(findLatestManagedClaBotComment([forged])).toBeNull()
  })

  it("ignores a User account whose login imitates the bot login", () => {
    const impersonator = makeComment({
      id: 32,
      body: MANAGED_BODY,
      user: { ...ATTACKER, login: `${APP_SLUG}[bot]`, type: "User" },
    })

    expect(findLatestManagedClaBotComment([impersonator])).toBeNull()
  })

  it("does not let a newer forged comment shadow the bot's own older comment", () => {
    const genuine = makeComment({ id: 41, body: MANAGED_BODY, user: OUR_BOT })
    const forged = makeComment({
      id: 42,
      body: `${CLA_BOT_COMMENT_SIGNATURE}\n**[Sign the CLA](https://evil.example/phish)**`,
      user: ATTACKER,
    })

    expect(findLatestManagedClaBotComment([genuine, forged])?.id).toBe(41)
  })

  it("fails closed when GITHUB_APP_SLUG is unset", () => {
    vi.stubEnv("GITHUB_APP_SLUG", "")
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const genuine = makeComment({ id: 51, body: MANAGED_BODY, user: OUR_BOT })

    expect(findLatestManagedClaBotComment([genuine])).toBeNull()
  })

  it("rejects a comment performed via a different GitHub App when GITHUB_APP_ID is set", () => {
    vi.stubEnv("GITHUB_APP_ID", "777")
    const ours = makeComment({
      id: 61,
      body: MANAGED_BODY,
      user: OUR_BOT,
      performed_via_github_app_id: 777,
    })
    const foreign = makeComment({
      id: 62,
      body: MANAGED_BODY,
      user: OUR_BOT,
      performed_via_github_app_id: 999,
    })
    const unknownApp = makeComment({
      id: 63,
      body: MANAGED_BODY,
      user: OUR_BOT,
      performed_via_github_app_id: null,
    })

    expect(findLatestManagedClaBotComment([ours, foreign])?.id).toBe(61)
    expect(isManagedClaBotComment(foreign)).toBe(false)
    // GitHub does not always report the app; login + type still decide then.
    expect(isManagedClaBotComment(unknownApp)).toBe(true)
  })
})

describe("findOwnedClaBotComment", () => {
  it("returns the client's comment only when it is owned by the bot", async () => {
    const genuine = makeComment({ id: 71, body: MANAGED_BODY, user: OUR_BOT })
    const forged = makeComment({ id: 72, body: MANAGED_BODY, user: ATTACKER })

    const trusting = { findBotComment: vi.fn().mockResolvedValue(genuine) }
    expect(await findOwnedClaBotComment(trusting, "org", "repo", 1)).toEqual(genuine)

    // A client that (wrongly) returns a marker-only match is still stopped here.
    const naive = { findBotComment: vi.fn().mockResolvedValue(forged) }
    expect(await findOwnedClaBotComment(naive, "org", "repo", 1)).toBeNull()

    const empty = { findBotComment: vi.fn().mockResolvedValue(null) }
    expect(await findOwnedClaBotComment(empty, "org", "repo", 1)).toBeNull()
  })
})
