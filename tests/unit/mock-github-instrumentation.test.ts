import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  clearMockGitHubCallLog,
  configureMockGitHub,
  getMockGitHubCallLog,
  getMockGitHubClient,
  getMockGitHubConfig,
  MockGitHubRequestError,
  resetMockGitHub,
} from "@/lib/github/mock-github-client"

describe("MockGitHubClient instrumentation", () => {
  beforeEach(() => resetMockGitHub())
  afterEach(() => resetMockGitHub())

  it("records every call in order with args and duration", async () => {
    const client = getMockGitHubClient()
    await client.checkOrgMembership("fiveonefour", "orgadmin")
    await client.createCheckRun({
      owner: "fiveonefour",
      repo: "sdk",
      name: "CLA",
      head_sha: "abc",
      status: "in_progress",
    })

    const log = getMockGitHubCallLog()
    expect(log.map((call) => call.method)).toEqual(["checkOrgMembership", "createCheckRun"])
    expect(log[0].seq).toBe(1)
    expect(log[1].seq).toBe(2)
    expect(log[0].args).toEqual(["fiveonefour", "orgadmin"])
    expect(log[0].error).toBeNull()
    expect(log[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it("returns copies of the log", async () => {
    const client = getMockGitHubClient()
    await client.getUser("orgadmin")
    const log = getMockGitHubCallLog()
    log.pop()
    expect(getMockGitHubCallLog()).toHaveLength(1)
  })

  it("clearMockGitHubCallLog keeps mock state but drops the log", async () => {
    const client = getMockGitHubClient()
    await client.createComment({ owner: "o", repo: "r", issue_number: 1, body: "hi" })
    clearMockGitHubCallLog()
    expect(getMockGitHubCallLog()).toHaveLength(0)
    expect(await client.listComments({ owner: "o", repo: "r", issue_number: 1 })).toHaveLength(1)
  })

  it("applies configured latency to each call", async () => {
    configureMockGitHub({ latencyMs: 40 })
    const client = getMockGitHubClient()
    const started = Date.now()
    await client.getUser("orgadmin")
    await client.getUser("contributor1")
    expect(Date.now() - started).toBeGreaterThanOrEqual(75)
    for (const call of getMockGitHubCallLog()) {
      expect(call.durationMs).toBeGreaterThanOrEqual(35)
    }
  })

  it("injects a failure with status and clears one-shot failures", async () => {
    configureMockGitHub({
      failures: { checkOrgMembership: { status: 403, message: "nope", times: 1 } },
    })
    const client = getMockGitHubClient()

    await expect(client.checkOrgMembership("fiveonefour", "orgadmin")).rejects.toMatchObject({
      status: 403,
      message: "nope",
    })
    await expect(client.checkOrgMembership("fiveonefour", "orgadmin"))
      .rejects.toBeInstanceOf(MockGitHubRequestError)
      .catch(() => undefined)

    expect(getMockGitHubConfig().failures).toEqual({})
    await expect(client.checkOrgMembership("fiveonefour", "orgadmin")).resolves.toBe("active")

    const log = getMockGitHubCallLog()
    expect(log[0].error).toBe("nope")
    expect(log[log.length - 1].error).toBeNull()
  })

  it("persistent failures repeat until cleared", async () => {
    configureMockGitHub({ failures: { getUser: { status: 500 } } })
    const client = getMockGitHubClient()
    await expect(client.getUser("orgadmin")).rejects.toMatchObject({ status: 500 })
    await expect(client.getUser("orgadmin")).rejects.toMatchObject({ status: 500 })
    configureMockGitHub({ failures: { getUser: null } })
    await expect(client.getUser("orgadmin")).resolves.toMatchObject({ login: "orgadmin" })
  })

  it("reset restores default config and empties the log", async () => {
    configureMockGitHub({ latencyMs: 10, failures: { getUser: { status: 500 } } })
    const client = getMockGitHubClient()
    await client.getUser("orgadmin").catch(() => undefined)
    resetMockGitHub()
    expect(getMockGitHubConfig()).toEqual({ latencyMs: 0, failures: {} })
    expect(getMockGitHubCallLog()).toHaveLength(0)
  })
})
