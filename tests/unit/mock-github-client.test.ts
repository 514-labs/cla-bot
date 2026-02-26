import { afterEach, describe, expect, it } from "vitest"
import {
  getMockGitHubClient,
  resetMockGitHub,
  getAllCheckRuns,
  getAllComments,
  upsertMockPullRequest,
} from "@/lib/github/mock-github-client"
import type { GitHubClient } from "@/lib/github/client"
import { CLA_BOT_COMMENT_SIGNATURE } from "@/lib/pr-comment-template"

afterEach(() => {
  resetMockGitHub()
})

describe("MockGitHubClient", () => {
  let client: GitHubClient

  afterEach(() => {
    resetMockGitHub()
  })

  it("returns singleton instance", () => {
    const a = getMockGitHubClient()
    const b = getMockGitHubClient()
    expect(a).toBe(b)
  })

  describe("getUser", () => {
    it("returns known user", async () => {
      client = getMockGitHubClient()
      const user = await client.getUser("orgadmin")
      expect(user).not.toBeNull()
      expect(user?.login).toBe("orgadmin")
      expect(user?.id).toBe(1001)
    })

    it("returns null for unknown user", async () => {
      client = getMockGitHubClient()
      const user = await client.getUser("nonexistent")
      expect(user).toBeNull()
    })
  })

  describe("checkOrgMembership", () => {
    it("returns active for org member", async () => {
      client = getMockGitHubClient()
      const status = await client.checkOrgMembership("fiveonefour", "orgadmin")
      expect(status).toBe("active")
    })

    it("returns not_member for non-member", async () => {
      client = getMockGitHubClient()
      const status = await client.checkOrgMembership("fiveonefour", "random-dev")
      expect(status).toBe("not_member")
    })
  })

  describe("getRepositoryPermissionLevel", () => {
    it("returns permission for known repo collaborator", async () => {
      client = getMockGitHubClient()
      const perm = await client.getRepositoryPermissionLevel("fiveonefour", "sdk", "orgadmin")
      expect(perm).toBe("admin")
    })

    it("returns none for unknown collaborator", async () => {
      client = getMockGitHubClient()
      const perm = await client.getRepositoryPermissionLevel("fiveonefour", "sdk", "random-dev")
      expect(perm).toBe("none")
    })
  })

  describe("check runs", () => {
    it("creates and retrieves check runs", async () => {
      client = getMockGitHubClient()
      const created = await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "CLA Check",
        head_sha: "abc123",
        status: "completed",
        conclusion: "success",
        output: { title: "CLA Signed", summary: "All good" },
      })
      expect(created.id).toBe(1)
      expect(created.name).toBe("CLA Check")
      expect(created.conclusion).toBe("success")

      const found = await client.getCheckRunForPr("fiveonefour", "sdk", "abc123", "CLA Check")
      expect(found).not.toBeNull()
      expect(found?.id).toBe(1)
    })

    it("updates check run", async () => {
      client = getMockGitHubClient()
      const created = await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "CLA Check",
        head_sha: "abc123",
        status: "in_progress",
      })

      const updated = await client.updateCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        check_run_id: created.id,
        status: "completed",
        conclusion: "failure",
      })
      expect(updated.status).toBe("completed")
      expect(updated.conclusion).toBe("failure")
    })

    it("throws when updating non-existent check run", async () => {
      client = getMockGitHubClient()
      await expect(
        client.updateCheckRun({
          owner: "fiveonefour",
          repo: "sdk",
          check_run_id: 999,
        })
      ).rejects.toThrow("Check run 999 not found")
    })

    it("returns null for non-existent check run by PR", async () => {
      client = getMockGitHubClient()
      const result = await client.getCheckRunForPr("fiveonefour", "sdk", "nonexistent", "CLA Check")
      expect(result).toBeNull()
    })

    it("lists check runs for ref", async () => {
      client = getMockGitHubClient()
      await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "Check 1",
        head_sha: "sha1",
        status: "completed",
      })
      await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "Check 2",
        head_sha: "sha1",
        status: "completed",
      })
      await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "Check 3",
        head_sha: "sha2",
        status: "completed",
      })

      const runs = await client.listCheckRunsForRef("fiveonefour", "sdk", "sha1")
      expect(runs).toHaveLength(2)
    })
  })

  describe("comments", () => {
    it("creates and lists comments", async () => {
      client = getMockGitHubClient()
      await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: "Test comment",
      })

      const comments = await client.listComments({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
      })
      expect(comments).toHaveLength(1)
      expect(comments[0].body).toBe("Test comment")
    })

    it("updates comment", async () => {
      client = getMockGitHubClient()
      const created = await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: "Original",
      })

      const updated = await client.updateComment({
        owner: "fiveonefour",
        repo: "sdk",
        comment_id: created.id,
        body: "Updated",
      })
      expect(updated.body).toBe("Updated")
    })

    it("deletes comment", async () => {
      client = getMockGitHubClient()
      const created = await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: "To be deleted",
      })

      await client.deleteComment({
        owner: "fiveonefour",
        repo: "sdk",
        comment_id: created.id,
      })

      const comments = await client.listComments({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
      })
      expect(comments).toHaveLength(0)
    })

    it("throws when updating non-existent comment", async () => {
      client = getMockGitHubClient()
      await expect(
        client.updateComment({
          owner: "fiveonefour",
          repo: "sdk",
          comment_id: 999,
          body: "nope",
        })
      ).rejects.toThrow("Comment 999 not found")
    })

    it("throws when deleting non-existent comment", async () => {
      client = getMockGitHubClient()
      await expect(
        client.deleteComment({
          owner: "fiveonefour",
          repo: "sdk",
          comment_id: 999,
        })
      ).rejects.toThrow("Comment 999 not found")
    })

    it("findBotComment returns latest managed comment", async () => {
      client = getMockGitHubClient()
      await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: `${CLA_BOT_COMMENT_SIGNATURE}\nFirst CLA comment`,
      })
      await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: `${CLA_BOT_COMMENT_SIGNATURE}\nSecond CLA comment`,
      })

      const found = await client.findBotComment("fiveonefour", "sdk", 1)
      expect(found).not.toBeNull()
      expect(found?.body).toContain("Second CLA comment")
    })

    it("findBotComment returns null when no managed comments", async () => {
      client = getMockGitHubClient()
      await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: "Regular comment",
      })

      const found = await client.findBotComment("fiveonefour", "sdk", 1)
      expect(found).toBeNull()
    })
  })

  describe("pull requests", () => {
    it("gets pull request head SHA from upserted PR", async () => {
      client = getMockGitHubClient()
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 42,
        headSha: "abc123",
        authorLogin: "contributor1",
      })

      const sha = await client.getPullRequestHeadSha("fiveonefour", "sdk", 42)
      expect(sha).toBe("abc123")
    })

    it("getPullRequest returns PR data", async () => {
      client = getMockGitHubClient()
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 10,
        headSha: "def456",
        authorLogin: "contributor1",
        authorId: 1002,
      })

      const pr = await client.getPullRequest("fiveonefour", "sdk", 10)
      expect(pr).not.toBeNull()
      expect(pr?.number).toBe(10)
      expect(pr?.headSha).toBe("def456")
      expect(pr?.authorLogin).toBe("contributor1")
    })

    it("getPullRequest returns null for unknown PR", async () => {
      client = getMockGitHubClient()
      const pr = await client.getPullRequest("fiveonefour", "sdk", 999)
      expect(pr).toBeNull()
    })

    it("lists open PRs by author", async () => {
      client = getMockGitHubClient()
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 1,
        headSha: "sha1",
        authorLogin: "contributor1",
      })
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 2,
        headSha: "sha2",
        authorLogin: "contributor1",
      })
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 3,
        headSha: "sha3",
        authorLogin: "orgadmin",
      })

      const prs = await client.listOpenPullRequestsByAuthor("fiveonefour", "sdk", "contributor1")
      expect(prs).toHaveLength(2)
    })

    it("lists open PRs for organization", async () => {
      client = getMockGitHubClient()
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 1,
        headSha: "sha1",
        authorLogin: "contributor1",
      })
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "other-repo",
        number: 2,
        headSha: "sha2",
        authorLogin: "orgadmin",
      })

      const prs = await client.listOpenPullRequestsForOrganization("fiveonefour")
      expect(prs).toHaveLength(2)
      expect(prs[0].repoName).toBe("sdk")
      expect(prs[1].repoName).toBe("other-repo")
    })

    it("upsertMockPullRequest updates existing PR", async () => {
      client = getMockGitHubClient()
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 1,
        headSha: "sha1",
        authorLogin: "contributor1",
      })
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 1,
        headSha: "sha2",
        authorLogin: "contributor1",
      })

      const sha = await client.getPullRequestHeadSha("fiveonefour", "sdk", 1)
      expect(sha).toBe("sha2")
    })

    it("upsertMockPullRequest resolves authorId from known users", async () => {
      client = getMockGitHubClient()
      upsertMockPullRequest({
        owner: "fiveonefour",
        repo: "sdk",
        number: 1,
        headSha: "sha1",
        authorLogin: "contributor1",
      })

      const pr = await client.getPullRequest("fiveonefour", "sdk", 1)
      expect(pr?.authorId).toBe(1002)
    })
  })

  describe("resetMockGitHub", () => {
    it("clears all state", async () => {
      client = getMockGitHubClient()
      await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "test",
        head_sha: "sha1",
        status: "completed",
      })
      await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: "comment",
      })

      resetMockGitHub()

      expect(getAllCheckRuns()).toHaveLength(0)
      expect(getAllComments()).toHaveLength(0)
    })
  })

  describe("getAllCheckRuns / getAllComments", () => {
    it("returns copies of check runs", async () => {
      client = getMockGitHubClient()
      await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "test",
        head_sha: "sha1",
        status: "completed",
      })

      const runs = getAllCheckRuns()
      expect(runs).toHaveLength(1)
    })

    it("returns copies of comments with metadata", async () => {
      client = getMockGitHubClient()
      await client.createComment({
        owner: "fiveonefour",
        repo: "sdk",
        issue_number: 1,
        body: "test",
      })

      const comments = getAllComments()
      expect(comments).toHaveLength(1)
      expect(comments[0].owner).toBe("fiveonefour")
      expect(comments[0].repo).toBe("sdk")
      expect(comments[0].issue_number).toBe(1)
    })
  })

  describe("getPullRequestHeadSha fallback", () => {
    it("falls back to check run SHA when PR not in mock state", async () => {
      client = getMockGitHubClient()
      await client.createCheckRun({
        owner: "fiveonefour",
        repo: "sdk",
        name: "CLA Check",
        head_sha: "fallback-sha",
        status: "completed",
      })

      const sha = await client.getPullRequestHeadSha("fiveonefour", "sdk", 99)
      expect(sha).toBe("fallback-sha")
    })

    it("throws when PR not found and no check runs", async () => {
      client = getMockGitHubClient()
      await expect(client.getPullRequestHeadSha("fiveonefour", "sdk", 99)).rejects.toThrow(
        "Pull request #99 not found"
      )
    })
  })
})
