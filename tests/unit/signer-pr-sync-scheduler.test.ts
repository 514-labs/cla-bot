import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("workflow/api", () => ({
  start: vi.fn(),
}))

vi.mock("@/lib/db/queries", () => ({
  createAuditEvent: vi.fn(),
}))

vi.mock("@/workflows/signer-pr-sync", () => ({
  runSignerPrSyncWorkflow: vi.fn(),
}))

import { scheduleSignerPrSyncAfterSign } from "@/lib/cla/signer-pr-sync-scheduler"
import { start } from "workflow/api"
import { createAuditEvent } from "@/lib/db/queries"
import type { SignClaResult } from "@/lib/cla/signing"

afterEach(() => {
  vi.clearAllMocks()
})

const baseSignResult: SignClaResult = {
  signature: {
    id: "sig_1",
    githubUsername: "contributor1",
  } as unknown as SignClaResult["signature"],
  org: {
    id: "org_1",
    orgSlug: "fiveonefour",
    installationId: 12001,
    claSha256: "abc1234",
  },
  prSyncContext: {
    repoName: "sdk",
    prNumber: 42,
  },
}

const actor = {
  userId: "user_1",
  githubId: "1001",
  githubUsername: "contributor1",
}

describe("scheduleSignerPrSyncAfterSign", () => {
  it("skips scheduling when installationId is missing", async () => {
    const result = await scheduleSignerPrSyncAfterSign({
      signResult: { ...baseSignResult, org: { ...baseSignResult.org, installationId: null } },
      actor,
    })

    expect(result.prSyncScheduled).toBe(false)
    expect(result.prSyncSkippedReason).toBe("missing_installation_id")
    expect(result.prSyncRunId).toBeNull()
    expect(result.prSyncScheduleError).toBeNull()
  })

  it("schedules workflow and returns run ID", async () => {
    vi.mocked(start).mockResolvedValue({ runId: "run_123" } as unknown as Awaited<
      ReturnType<typeof start>
    >)

    const result = await scheduleSignerPrSyncAfterSign({
      signResult: baseSignResult,
      actor,
    })

    expect(result.prSyncScheduled).toBe(true)
    expect(result.prSyncRunId).toBe("run_123")
    expect(result.prSyncScheduleError).toBeNull()
    expect(result.prSyncSkippedReason).toBeNull()
    expect(start).toHaveBeenCalledOnce()
  })

  it("handles workflow scheduling failure", async () => {
    vi.mocked(start).mockRejectedValue(new Error("Workflow engine unavailable"))
    vi.mocked(createAuditEvent).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createAuditEvent>>
    )

    const result = await scheduleSignerPrSyncAfterSign({
      signResult: baseSignResult,
      actor,
    })

    expect(result.prSyncScheduled).toBe(false)
    expect(result.prSyncScheduleError).toBe("Workflow engine unavailable")
    expect(result.prSyncRunId).toBeNull()

    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "signature.pr_sync_schedule_failed",
        orgId: "org_1",
        userId: "user_1",
      })
    )
  })

  it("handles non-Error scheduling failure", async () => {
    vi.mocked(start).mockRejectedValue("string error")
    vi.mocked(createAuditEvent).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof createAuditEvent>>
    )

    const result = await scheduleSignerPrSyncAfterSign({
      signResult: baseSignResult,
      actor,
    })

    expect(result.prSyncScheduleError).toBe("Unknown signer PR sync scheduling failure")
  })

  it("survives audit event failure", async () => {
    vi.mocked(start).mockRejectedValue(new Error("Workflow down"))
    vi.mocked(createAuditEvent).mockRejectedValue(new Error("DB down"))

    const result = await scheduleSignerPrSyncAfterSign({
      signResult: baseSignResult,
      actor,
    })

    expect(result.prSyncScheduled).toBe(false)
    expect(result.prSyncScheduleError).toBe("Workflow down")
  })
})
