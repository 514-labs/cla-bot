import { createAuditEvent, getOrganizationBySlug } from "@/lib/db/queries"
import {
  type ClaOpenPrRecheckSummary,
  recheckOpenPullRequestsAfterClaUpdate,
} from "@/lib/cla/recheck-open-prs"

type OrganizationRow = Awaited<ReturnType<typeof getOrganizationBySlug>>
type AuditEventInput = Parameters<typeof createAuditEvent>[0]

export type ClaRecheckWorkflowInput = {
  orgSlug: string
  orgId: string
  claSha256: string | null
  appBaseUrl: string
  installationId: number | null
  actor: {
    userId: string | null
    githubId: string | null
    githubUsername: string | null
  }
}

export type ClaRecheckWorkflowResult =
  | {
      status: "completed"
      recheckSummary: ClaOpenPrRecheckSummary
    }
  | {
      status: "superseded" | "failed" | "org_not_found"
      error?: string
    }

export async function runClaRecheckWorkflow(
  input: ClaRecheckWorkflowInput
): Promise<ClaRecheckWorkflowResult> {
  "use workflow"

  const latestOrg = await loadOrganizationForRecheck(input.orgSlug)
  if (!latestOrg) {
    await recordAuditEvent({
      eventType: "cla.recheck_failed",
      orgId: input.orgId,
      userId: input.actor.userId,
      actorGithubId: input.actor.githubId,
      actorGithubUsername: input.actor.githubUsername,
      payload: {
        claSha256: input.claSha256,
        reason: "org_not_found",
      },
    })
    return { status: "org_not_found" }
  }

  if (latestOrg.claTextSha256 !== input.claSha256) {
    await recordAuditEvent({
      eventType: "cla.recheck_superseded",
      orgId: latestOrg.id,
      userId: input.actor.userId,
      actorGithubId: input.actor.githubId,
      actorGithubUsername: input.actor.githubUsername,
      payload: {
        scheduledClaSha256: input.claSha256,
        latestClaSha256: latestOrg.claTextSha256,
      },
    })
    return { status: "superseded" }
  }

  try {
    const recheckSummary = await runOpenPrRecheck({
      orgSlug: input.orgSlug,
      appBaseUrl: input.appBaseUrl,
      installationId: latestOrg.installationId ?? input.installationId ?? undefined,
    })

    const eventType = recheckSummary.error ? "cla.recheck_failed" : "cla.recheck_completed"
    await recordAuditEvent({
      eventType,
      orgId: latestOrg.id,
      userId: input.actor.userId,
      actorGithubId: input.actor.githubId,
      actorGithubUsername: input.actor.githubUsername,
      payload: {
        claSha256: input.claSha256,
        recheckSummary,
      },
    })

    if (recheckSummary.error) {
      return { status: "failed", error: recheckSummary.error }
    }

    return { status: "completed", recheckSummary }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow recheck failure"
    await recordAuditEvent({
      eventType: "cla.recheck_failed",
      orgId: latestOrg.id,
      userId: input.actor.userId,
      actorGithubId: input.actor.githubId,
      actorGithubUsername: input.actor.githubUsername,
      payload: {
        claSha256: input.claSha256,
        error: message,
      },
    })
    return { status: "failed", error: message }
  }
}

async function loadOrganizationForRecheck(orgSlug: string): Promise<OrganizationRow> {
  "use step"
  return getOrganizationBySlug(orgSlug)
}

async function recordAuditEvent(input: AuditEventInput) {
  "use step"
  await createAuditEvent(input)
}

async function runOpenPrRecheck(params: {
  orgSlug: string
  appBaseUrl: string
  installationId?: number
}) {
  "use step"
  return recheckOpenPullRequestsAfterClaUpdate(params)
}
