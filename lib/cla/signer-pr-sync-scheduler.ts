import { start } from "workflow/api"
import { createAuditEvent } from "@/lib/db/queries"
import { type SignClaResult } from "@/lib/cla/signing"
import { runSignerPrSyncWorkflow } from "@/workflows/signer-pr-sync"

type SignerPrSyncScheduleResult = {
  prSyncScheduled: boolean
  prSyncRunId: string | null
  prSyncScheduleError: string | null
  prSyncSkippedReason: string | null
}

export async function scheduleSignerPrSyncAfterSign(params: {
  signResult: SignClaResult
  actor: {
    userId: string
    githubId: string | null
    githubUsername: string | null
  }
}): Promise<SignerPrSyncScheduleResult> {
  const { signResult, actor } = params

  if (!signResult.org.installationId) {
    return {
      prSyncScheduled: false,
      prSyncRunId: null,
      prSyncScheduleError: null,
      prSyncSkippedReason: "missing_installation_id",
    }
  }

  try {
    const run = await start(runSignerPrSyncWorkflow, [
      {
        orgSlug: signResult.org.orgSlug,
        orgId: signResult.org.id,
        signedClaSha256: signResult.org.claSha256,
        signer: {
          userId: actor.userId,
          githubId: actor.githubId,
          githubUsername: signResult.signature.githubUsername,
        },
        repoName: signResult.prSyncContext.repoName,
        prNumber: signResult.prSyncContext.prNumber,
      },
    ])

    return {
      prSyncScheduled: true,
      prSyncRunId: run.runId,
      prSyncScheduleError: null,
      prSyncSkippedReason: null,
    }
  } catch (error) {
    const scheduleError =
      error instanceof Error ? error.message : "Unknown signer PR sync scheduling failure"
    console.error("Failed to schedule signer PR sync workflow:", error)

    try {
      await createAuditEvent({
        eventType: "signature.pr_sync_schedule_failed",
        orgId: signResult.org.id,
        userId: actor.userId,
        actorGithubId: actor.githubId,
        actorGithubUsername: actor.githubUsername,
        payload: {
          signedClaSha256: signResult.org.claSha256,
          repoName: signResult.prSyncContext.repoName,
          prNumber: signResult.prSyncContext.prNumber,
          error: scheduleError,
        },
      })
    } catch (auditError) {
      console.error("Failed to write schedule failure audit event:", auditError)
    }

    return {
      prSyncScheduled: false,
      prSyncRunId: null,
      prSyncScheduleError: scheduleError,
      prSyncSkippedReason: null,
    }
  }
}
