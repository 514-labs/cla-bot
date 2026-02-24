"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { start } from "workflow/api"
import { z } from "zod"
import { createAuditEvent, setOrganizationActive, updateOrganizationCla } from "@/lib/db/queries"
import { authorizeOrgAccess } from "@/lib/server/org-access"
import { getBaseUrlFromHeaders } from "@/lib/cla/signing"
import { runClaRecheckWorkflow } from "@/workflows/cla-recheck"

const updateClaSchema = z.object({
  orgSlug: z.string().min(1),
  claMarkdown: z.string().trim().min(1, "CLA text cannot be empty"),
})

const toggleActiveSchema = z.object({
  orgSlug: z.string().min(1),
  isActive: z.boolean(),
})

type ActionResult = {
  ok: boolean
  error?: string
}

export async function updateClaAction(input: unknown): Promise<ActionResult> {
  const parsed = updateClaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { orgSlug, claMarkdown } = parsed.data
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return { ok: false, error: access.message }
  }

  const org = await updateOrganizationCla(orgSlug, claMarkdown)
  if (!org) {
    return { ok: false, error: "Organization not found" }
  }

  const headerStore = await headers()
  const appBaseUrl = getBaseUrlFromHeaders(headerStore)

  let recheckRunId: string | null = null
  let recheckScheduleError: string | null = null
  try {
    const run = await start(runClaRecheckWorkflow, [
      {
        orgSlug,
        orgId: org.id,
        claSha256: org.claTextSha256,
        appBaseUrl,
        actor: {
          userId: access.user.id,
          githubId: access.user.githubId ?? null,
          githubUsername: access.user.githubUsername ?? null,
        },
      },
    ])
    recheckRunId = run.runId
  } catch (error) {
    recheckScheduleError =
      error instanceof Error ? error.message : "Unknown CLA recheck workflow scheduling failure"
    console.error("Failed to schedule CLA recheck workflow:", error)

    await createAuditEvent({
      eventType: "cla.recheck_schedule_failed",
      orgId: org.id,
      userId: access.user.id,
      actorGithubId: access.user.githubId ?? null,
      actorGithubUsername: access.user.githubUsername,
      payload: {
        claSha256: org.claTextSha256,
        error: recheckScheduleError,
      },
    })
  }

  await createAuditEvent({
    eventType: "cla.updated",
    orgId: org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      recheckScheduled: recheckRunId !== null,
      recheckRunId,
      recheckScheduleError,
    },
  })

  revalidatePath(`/admin/${orgSlug}`)
  revalidatePath("/admin")

  return { ok: true }
}

export async function toggleOrganizationActiveAction(input: unknown): Promise<ActionResult> {
  const parsed = toggleActiveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { orgSlug, isActive } = parsed.data
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return { ok: false, error: access.message }
  }

  const org = await setOrganizationActive(orgSlug, isActive)
  if (!org) {
    return { ok: false, error: "Organization not found" }
  }

  await createAuditEvent({
    eventType: "organization.activation_changed",
    orgId: org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: { isActive },
  })

  revalidatePath(`/admin/${orgSlug}`)
  revalidatePath("/admin")

  return { ok: true }
}
