import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/queries", () => ({
  getOrganizationBySlug: vi.fn(),
  isBypassAccountForOrg: vi.fn(),
  getSignatureStatusByGithubId: vi.fn(),
  getSignatureStatusByUsername: vi.fn(),
}))

vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
}))

import { recheckOpenPullRequestsAfterClaUpdate } from "@/lib/cla/recheck-open-prs"
import {
  getOrganizationBySlug,
  isBypassAccountForOrg,
  getSignatureStatusByGithubId,
  getSignatureStatusByUsername,
} from "@/lib/db/queries"
import { getGitHubClient } from "@/lib/github"
import { CLA_BOT_COMMENT_SIGNATURE } from "@/lib/pr-comment-template"

afterEach(() => {
  vi.clearAllMocks()
})

const mockOrg = {
  id: "org_1",
  githubOrgSlug: "fiveonefour",
  name: "Fiveonefour",
  isActive: true,
  claText: "CLA text",
  claTextSha256: "abc1234567890",
  installationId: 12001,
  githubAccountType: "organization",
  githubAccountId: "2001",
}

function createMockGitHubClient() {
  return {
    listOpenPullRequestsForOrganization: vi.fn().mockResolvedValue([]),
    createCheckRun: vi.fn().mockResolvedValue({ id: 1 }),
    findBotComment: vi.fn().mockResolvedValue(null),
    deleteComment: vi.fn().mockResolvedValue(undefined),
    updateComment: vi.fn().mockResolvedValue({ id: 1 }),
    createComment: vi.fn().mockResolvedValue({ id: 1 }),
    checkOrgMembership: vi.fn().mockResolvedValue("not_member"),
  }
}

describe("recheckOpenPullRequestsAfterClaUpdate", () => {
  it("returns error when org not found", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "unknown",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.error).toContain("not found")
    expect(result.attempted).toBe(0)
  })

  it("returns error when GitHub client fails", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getGitHubClient).mockImplementation(() => {
      throw new Error("No credentials")
    })

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.error).toBe("No credentials")
  })

  it("returns error when listing PRs fails", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockRejectedValue(new Error("API rate limited"))
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.error).toBe("API rate limited")
  })

  it("handles empty PR list", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.attempted).toBe(0)
    expect(result.error).toBeNull()
  })

  it("passes inactive checks and deletes old CLA comments when org is inactive", async () => {
    const inactiveOrg = { ...mockOrg, isActive: false }
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      inactiveOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "contributor1", authorId: 1002 },
    ])
    mockClient.findBotComment.mockResolvedValue({
      id: 100,
      body: `${CLA_BOT_COMMENT_SIGNATURE}\n### Contributor License Agreement Required`,
    })
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.skippedInactive).toBe(true)
    expect(result.passedInactiveChecks).toBe(1)
    expect(result.commentsDeleted).toBe(1)
    expect(result.rechecked).toBe(1)
    expect(mockClient.createCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: "success",
        output: expect.objectContaining({ title: "CLA: Bot deactivated" }),
      })
    )
  })

  it("passes bypass check for bypass users", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      {
        repoName: "sdk",
        number: 1,
        headSha: "sha1",
        authorLogin: "dependabot[bot]",
        authorId: 9000,
      },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue({
      bypassKind: "app_bot",
      githubUsername: "dependabot",
    } as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.passedBypassChecks).toBe(1)
    expect(result.skippedBypass).toBe(1)
    expect(result.rechecked).toBe(1)
  })

  it("passes bypass check with user kind message", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "bot-user", authorId: 9000 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue({
      bypassKind: "user",
      githubUsername: "bot-user",
    } as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.passedBypassChecks).toBe(1)
  })

  it("skips org members", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "orgadmin", authorId: 1001 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    mockClient.checkOrgMembership.mockResolvedValue("active")
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.skippedOrgMembers).toBe(1)
  })

  it("skips personal account owner", async () => {
    const personalOrg = {
      ...mockOrg,
      githubAccountType: "user",
      githubOrgSlug: "orgadmin",
      githubAccountId: "1001",
    }
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      personalOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "my-repo", number: 1, headSha: "sha1", authorLogin: "orgadmin", authorId: 1001 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "orgadmin",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.skippedOrgMembers).toBe(1)
  })

  it("skips compliant signers (already signed current version)", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "contributor1", authorId: 1002 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    mockClient.checkOrgMembership.mockResolvedValue("not_member")
    vi.mocked(getSignatureStatusByGithubId).mockResolvedValue({
      signed: true,
      currentVersion: true,
    } as unknown as Awaited<ReturnType<typeof getSignatureStatusByGithubId>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.skippedCompliant).toBe(1)
  })

  it("creates failure check and new comment for unsigned contributors", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      {
        repoName: "sdk",
        number: 1,
        headSha: "sha1",
        authorLogin: "new-contributor",
        authorId: 1004,
      },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    mockClient.checkOrgMembership.mockResolvedValue("not_member")
    vi.mocked(getSignatureStatusByGithubId).mockResolvedValue({
      signed: false,
      currentVersion: false,
    } as unknown as Awaited<ReturnType<typeof getSignatureStatusByGithubId>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.failedChecks).toBe(1)
    expect(result.commentsCreated).toBe(1)
    expect(result.rechecked).toBe(1)
    expect(mockClient.createCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: "failure",
        output: expect.objectContaining({ title: "CLA: Signature required" }),
      })
    )
  })

  it("creates re-sign failure check for outdated signers", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "contributor1", authorId: 1002 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    mockClient.checkOrgMembership.mockResolvedValue("not_member")
    vi.mocked(getSignatureStatusByGithubId).mockResolvedValue({
      signed: true,
      currentVersion: false,
    } as unknown as Awaited<ReturnType<typeof getSignatureStatusByGithubId>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.failedChecks).toBe(1)
    expect(mockClient.createCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ title: "CLA: Re-signing required" }),
      })
    )
  })

  it("updates existing comment instead of creating a new one", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "contributor1", authorId: 1002 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    mockClient.checkOrgMembership.mockResolvedValue("not_member")
    vi.mocked(getSignatureStatusByGithubId).mockResolvedValue({
      signed: false,
      currentVersion: false,
    } as unknown as Awaited<ReturnType<typeof getSignatureStatusByGithubId>>)
    mockClient.findBotComment.mockResolvedValue({ id: 50, body: "old comment" })
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.commentsUpdated).toBe(1)
    expect(result.commentsCreated).toBe(0)
    expect(mockClient.updateComment).toHaveBeenCalled()
  })

  it("counts recheck errors when a PR throws", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "contributor1", authorId: 1002 },
    ])
    vi.mocked(isBypassAccountForOrg).mockRejectedValue(new Error("DB error"))
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.recheckErrors).toBe(1)
  })

  it("uses username lookup when authorId is not a number", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "contributor1" },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    mockClient.checkOrgMembership.mockResolvedValue("not_member")
    vi.mocked(getSignatureStatusByUsername).mockResolvedValue({
      signed: true,
      currentVersion: true,
    } as unknown as Awaited<ReturnType<typeof getSignatureStatusByUsername>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(getSignatureStatusByUsername).toHaveBeenCalledWith("fiveonefour", "contributor1")
    expect(result.skippedCompliant).toBe(1)
  })

  it("uses personal account membership check for user-type accounts", async () => {
    const personalOrg = {
      ...mockOrg,
      githubAccountType: "user",
      githubOrgSlug: "personaluser",
      githubAccountId: "5555",
    }
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      personalOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      {
        repoName: "my-repo",
        number: 1,
        headSha: "sha1",
        authorLogin: "external-contributor",
        authorId: 1006,
      },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>
    )
    vi.mocked(getSignatureStatusByGithubId).mockResolvedValue({
      signed: false,
      currentVersion: false,
    } as unknown as Awaited<ReturnType<typeof getSignatureStatusByGithubId>>)
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "personaluser",
      appBaseUrl: "https://cla.example.com",
    })

    // For user-type accounts, membership is always "not_member"
    // so the contributor should go through signature check
    expect(mockClient.checkOrgMembership).not.toHaveBeenCalled()
    expect(result.failedChecks).toBe(1)
  })

  it("deletes CLA comment for bypass users with existing comment", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockResolvedValue([
      { repoName: "sdk", number: 1, headSha: "sha1", authorLogin: "bot-user", authorId: 9000 },
    ])
    vi.mocked(isBypassAccountForOrg).mockResolvedValue({
      bypassKind: "user",
      githubUsername: "bot-user",
    } as unknown as Awaited<ReturnType<typeof isBypassAccountForOrg>>)
    mockClient.findBotComment.mockResolvedValue({
      id: 100,
      body: `${CLA_BOT_COMMENT_SIGNATURE}\n### Contributor License Agreement Required`,
    })
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.commentsDeleted).toBe(1)
    expect(mockClient.deleteComment).toHaveBeenCalled()
  })

  it("handles non-Error GitHub client creation failure", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    vi.mocked(getGitHubClient).mockImplementation(() => {
      throw "string error"
    })

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.error).toBe("GitHub client is not configured for this organization")
  })

  it("handles non-Error PR listing failure", async () => {
    vi.mocked(getOrganizationBySlug).mockResolvedValue(
      mockOrg as unknown as Awaited<ReturnType<typeof getOrganizationBySlug>>
    )
    const mockClient = createMockGitHubClient()
    mockClient.listOpenPullRequestsForOrganization.mockRejectedValue("string error")
    vi.mocked(getGitHubClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof getGitHubClient>
    )

    const result = await recheckOpenPullRequestsAfterClaUpdate({
      orgSlug: "fiveonefour",
      appBaseUrl: "https://cla.example.com",
    })

    expect(result.error).toBe("Failed to list open pull requests for organization")
  })
})
