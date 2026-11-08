import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const checksCreate = vi.fn()
const checksUpdate = vi.fn()

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    rest = { checks: { create: checksCreate, update: checksUpdate } }
  },
}))

import { OctokitGitHubClient } from "@/lib/github/octokit-client"

function httpError(status: number) {
  return Object.assign(new Error(`HttpError ${status}`), { status })
}

const checkRunData = {
  id: 42,
  head_sha: "abc123",
  name: "Contributor License Agreement",
  status: "completed",
  conclusion: "success",
  started_at: "2026-10-19T20:58:00Z",
  completed_at: "2026-10-19T20:58:01Z",
  output: { title: "CLA: Merge queue", summary: "ok" },
  html_url: "https://github.com/x/y/runs/42",
}

const createParams = {
  owner: "514-labs",
  repo: "ax",
  name: "Contributor License Agreement",
  head_sha: "abc123",
  status: "completed" as const,
  conclusion: "success" as const,
}

describe("OctokitGitHubClient check-run retries", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    process.env.GITHUB_APP_ID = "1"
    process.env.GITHUB_PRIVATE_KEY = "key"
    checksCreate.mockReset()
    checksUpdate.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("retries createCheckRun after a GitHub 5xx", async () => {
    checksCreate.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({ data: checkRunData })
    const client = new OctokitGitHubClient(1)

    const result = client.createCheckRun(createParams)
    await vi.runAllTimersAsync()

    await expect(result).resolves.toMatchObject({ id: 42, conclusion: "success" })
    expect(checksCreate).toHaveBeenCalledTimes(2)
  })

  it("retries createCheckRun after a network error with no status", async () => {
    checksCreate
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ data: checkRunData })
    const client = new OctokitGitHubClient(1)

    const result = client.createCheckRun(createParams)
    await vi.runAllTimersAsync()

    await expect(result).resolves.toMatchObject({ id: 42 })
    expect(checksCreate).toHaveBeenCalledTimes(2)
  })

  it("retries updateCheckRun after a GitHub 5xx", async () => {
    checksUpdate.mockRejectedValueOnce(httpError(502)).mockResolvedValueOnce({ data: checkRunData })
    const client = new OctokitGitHubClient(1)

    const result = client.updateCheckRun({
      owner: "514-labs",
      repo: "ax",
      check_run_id: 42,
      status: "completed",
      conclusion: "success",
    })
    await vi.runAllTimersAsync()

    await expect(result).resolves.toMatchObject({ id: 42 })
    expect(checksUpdate).toHaveBeenCalledTimes(2)
  })

  it("does not retry a 4xx", async () => {
    checksCreate.mockRejectedValue(httpError(422))
    const client = new OctokitGitHubClient(1)

    await expect(client.createCheckRun(createParams)).rejects.toMatchObject({ status: 422 })
    expect(checksCreate).toHaveBeenCalledTimes(1)
  })

  it("gives up after three attempts on persistent 5xx", async () => {
    checksCreate.mockRejectedValue(httpError(503))
    const client = new OctokitGitHubClient(1)

    const result = client.createCheckRun(createParams)
    const assertion = expect(result).rejects.toMatchObject({ status: 503 })
    await vi.runAllTimersAsync()

    await assertion
    expect(checksCreate).toHaveBeenCalledTimes(3)
  })
})
