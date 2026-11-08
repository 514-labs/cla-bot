import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { withTransientRetry } from "@/lib/github/transient-retry"

function httpError(status: number) {
  return Object.assign(new Error(`HttpError ${status}`), { status })
}

function networkError(code: string) {
  return Object.assign(new Error(`connect ${code}`), { code })
}

describe("withTransientRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("retries after a GitHub 5xx", async () => {
    const op = vi.fn().mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce("ok")

    const result = withTransientRetry(op)
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe("ok")
    expect(op).toHaveBeenCalledTimes(2)
  })

  it("retries network errors by code, including a wrapped cause", async () => {
    const wrapped = Object.assign(new TypeError("fetch failed"), {
      cause: networkError("ECONNRESET"),
    })
    const op = vi
      .fn()
      .mockRejectedValueOnce(networkError("ETIMEDOUT"))
      .mockRejectedValueOnce(wrapped)
      .mockResolvedValueOnce("ok")

    const result = withTransientRetry(op)
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe("ok")
    expect(op).toHaveBeenCalledTimes(3)
  })

  it("waits 500 ms, then 1 s, between attempts", async () => {
    const op = vi.fn().mockRejectedValue(httpError(503))
    const result = withTransientRetry(op)
    const assertion = expect(result).rejects.toMatchObject({ status: 503 })

    await vi.advanceTimersByTimeAsync(0)
    expect(op).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(op).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(op).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(op).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(op).toHaveBeenCalledTimes(3)

    await assertion
  })

  it("does not retry a 4xx", async () => {
    const op = vi.fn().mockRejectedValue(httpError(422))

    await expect(withTransientRetry(op)).rejects.toMatchObject({ status: 422 })
    expect(op).toHaveBeenCalledTimes(1)
  })

  it("does not retry a programming error", async () => {
    const op = vi.fn().mockRejectedValue(new TypeError("cannot read properties of undefined"))

    await expect(withTransientRetry(op)).rejects.toThrow("cannot read properties")
    expect(op).toHaveBeenCalledTimes(1)
  })
})
