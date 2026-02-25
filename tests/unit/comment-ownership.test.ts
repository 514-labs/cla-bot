import { describe, expect, it } from "vitest"
import { findLatestManagedClaBotComment } from "@/lib/github/comment-ownership"
import type { IssueComment } from "@/lib/github/types"
import { CLA_BOT_COMMENT_SIGNATURE } from "@/lib/pr-comment-template"

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

    const result = findLatestManagedClaBotComment([vercelComment])
    expect(result).toBeNull()
  })

  it("returns the latest CLA-bot managed comment by signature marker", () => {
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
    const oldManagedComment = makeComment({
      id: 22,
      body: `${CLA_BOT_COMMENT_SIGNATURE}\n### Contributor License Agreement Required`,
      user: {
        login: "cla-bot-by-fiveonefour[bot]",
        id: 101010,
        avatar_url: "https://avatars.githubusercontent.com/in/1",
        html_url: "https://github.com/apps/cla-bot-by-fiveonefour",
        type: "Bot",
      },
    })
    const latestManagedComment = makeComment({
      id: 23,
      body: `${CLA_BOT_COMMENT_SIGNATURE}\n### CLA Re-signing Required`,
      user: {
        login: "cla-bot-by-fiveonefour[bot]",
        id: 101010,
        avatar_url: "https://avatars.githubusercontent.com/in/1",
        html_url: "https://github.com/apps/cla-bot-by-fiveonefour",
        type: "Bot",
      },
    })

    const result = findLatestManagedClaBotComment([
      externalBotComment,
      oldManagedComment,
      latestManagedComment,
    ])
    expect(result?.id).toBe(23)
  })
})
