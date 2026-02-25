"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { start } from "workflow/api"
import { z } from "zod"
import {
  addBypassAccount,
  countBypassAccountsByOrg,
  createAuditEvent,
  getBypassAccountByOrgAndActorSlug,
  getBypassAccountByOrgAndGithubId,
  getBypassAccountByOrgAndGithubUsername,
  removeBypassAccount,
  setOrganizationActive,
  updateOrganizationCla,
} from "@/lib/db/queries"
import { authorizeOrgAccess } from "@/lib/server/org-access"
import { getBaseUrlFromHeaders } from "@/lib/cla/signing"
import { runClaRecheckWorkflow } from "@/workflows/cla-recheck"
import { formatBypassActorLogin, normalizeBypassActorSlug } from "@/lib/bypass"

const MAX_ORG_BYPASS_ACCOUNTS = 50

const updateClaSchema = z.object({
  orgSlug: z.string().min(1),
  claMarkdown: z.string().trim().min(1, "CLA text cannot be empty"),
})

const toggleActiveSchema = z.object({
  orgSlug: z.string().min(1),
  isActive: z.boolean(),
})

const addBypassSchema = z.object({
  orgSlug: z.string().min(1),
})

const addUserBypassSchema = addBypassSchema.extend({
  bypassKind: z.literal("user"),
  githubUserId: z.string().trim().min(1, "GitHub user is required"),
  githubUsername: z.string().trim().min(1, "GitHub username is required"),
})

const addAppBotBypassSchema = addBypassSchema.extend({
  bypassKind: z.literal("app_bot"),
  actorSlug: z.string().trim().min(1, "App or bot slug is required"),
  githubUsername: z.string().trim().optional(),
})

const addBypassInputSchema = z.discriminatedUnion("bypassKind", [
  addUserBypassSchema,
  addAppBotBypassSchema,
])

const removeBypassSchema = z.object({
  orgSlug: z.string().min(1),
  bypassAccountId: z.string().trim().min(1, "Bypass account ID is required"),
})

type ActionResult = {
  ok: boolean
  error?: string
  recheckScheduled?: boolean
  recheckRunId?: string | null
  recheckScheduleError?: string | null
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

  const recheck = await scheduleClaRecheckForOrg({
    orgSlug,
    orgId: org.id,
    claSha256: org.claTextSha256,
    appBaseUrl,
    actor: {
      userId: access.user.id,
      githubId: access.user.githubId ?? null,
      githubUsername: access.user.githubUsername ?? null,
    },
  })

  await createAuditEvent({
    eventType: "cla.updated",
    orgId: org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      recheckScheduled: recheck.recheckScheduled,
      recheckRunId: recheck.recheckRunId,
      recheckScheduleError: recheck.recheckScheduleError,
    },
  })

  revalidatePath(`/admin/${orgSlug}`)
  revalidatePath("/admin")

  return { ok: true, ...recheck }
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

  const headerStore = await headers()
  const appBaseUrl = getBaseUrlFromHeaders(headerStore)
  const recheck = await scheduleClaRecheckForOrg({
    orgSlug,
    orgId: org.id,
    claSha256: org.claTextSha256,
    appBaseUrl,
    actor: {
      userId: access.user.id,
      githubId: access.user.githubId ?? null,
      githubUsername: access.user.githubUsername ?? null,
    },
  })

  await createAuditEvent({
    eventType: "organization.activation_changed",
    orgId: org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      isActive,
      recheckScheduled: recheck.recheckScheduled,
      recheckRunId: recheck.recheckRunId,
      recheckScheduleError: recheck.recheckScheduleError,
    },
  })

  revalidatePath(`/admin/${orgSlug}`)
  revalidatePath("/admin")

  return { ok: true, ...recheck }
}

export async function addBypassAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = addBypassInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { orgSlug } = parsed.data
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return { ok: false, error: access.message }
  }

  const count = await countBypassAccountsByOrg(access.org.id)
  if (count >= MAX_ORG_BYPASS_ACCOUNTS) {
    return { ok: false, error: `Bypass list limit reached (${MAX_ORG_BYPASS_ACCOUNTS})` }
  }

  let created: Awaited<ReturnType<typeof addBypassAccount>> | undefined | null = null
  let payload: Record<string, unknown> = {}

  if (parsed.data.bypassKind === "user") {
    const { githubUserId, githubUsername } = parsed.data
    const existingById = await getBypassAccountByOrgAndGithubId(access.org.id, githubUserId, "user")
    if (existingById) {
      return { ok: false, error: `@${existingById.githubUsername} is already on the bypass list` }
    }

    const existingByUsername = await getBypassAccountByOrgAndGithubUsername(
      access.org.id,
      githubUsername,
      "user"
    )
    if (existingByUsername) {
      return {
        ok: false,
        error: `@${existingByUsername.githubUsername} is already on the bypass list`,
      }
    }

    created = await addBypassAccount({
      orgId: access.org.id,
      bypassKind: "user",
      githubUserId,
      githubUsername,
      createdByUserId: access.user.id,
    })
    payload = {
      bypassKind: "user",
      githubUserId,
      githubUsername,
    }
  } else {
    const normalizedActorSlug = normalizeBypassActorSlug(parsed.data.actorSlug)
    if (!normalizedActorSlug) {
      return { ok: false, error: "App or bot slug is required" }
    }
    const actorLogin = formatBypassActorLogin(normalizedActorSlug)

    const existingByActorSlug = await getBypassAccountByOrgAndActorSlug(
      access.org.id,
      normalizedActorSlug
    )
    if (existingByActorSlug) {
      return {
        ok: false,
        error: `@${existingByActorSlug.githubUsername} is already on the app/bot bypass list`,
      }
    }

    created = await addBypassAccount({
      orgId: access.org.id,
      bypassKind: "app_bot",
      actorSlug: normalizedActorSlug,
      githubUsername: actorLogin,
      createdByUserId: access.user.id,
    })
    payload = {
      bypassKind: "app_bot",
      actorSlug: normalizedActorSlug,
      githubUsername: actorLogin,
    }
  }

  if (!created) {
    return { ok: false, error: "Bypass account already exists" }
  }

  const headerStore = await headers()
  const appBaseUrl = getBaseUrlFromHeaders(headerStore)
  const recheck = await scheduleClaRecheckForOrg({
    orgSlug,
    orgId: access.org.id,
    claSha256: access.org.claTextSha256,
    appBaseUrl,
    actor: {
      userId: access.user.id,
      githubId: access.user.githubId ?? null,
      githubUsername: access.user.githubUsername ?? null,
    },
  })

  await createAuditEvent({
    eventType: "organization.bypass_account_added",
    orgId: access.org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      bypassAccountId: created.id,
      ...payload,
      recheckScheduled: recheck.recheckScheduled,
      recheckRunId: recheck.recheckRunId,
      recheckScheduleError: recheck.recheckScheduleError,
    },
  })

  revalidatePath(`/admin/${orgSlug}`)
  revalidatePath("/admin")

  return { ok: true, ...recheck }
}

export async function removeBypassAccountAction(input: unknown): Promise<ActionResult> {
  const parsed = removeBypassSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { orgSlug, bypassAccountId } = parsed.data
  const access = await authorizeOrgAccess(orgSlug)
  if (!access.ok) {
    return { ok: false, error: access.message }
  }

  const removed = await removeBypassAccount({
    orgId: access.org.id,
    bypassAccountId,
  })
  if (!removed) {
    return { ok: false, error: "Bypass account not found" }
  }

  const headerStore = await headers()
  const appBaseUrl = getBaseUrlFromHeaders(headerStore)
  const recheck = await scheduleClaRecheckForOrg({
    orgSlug,
    orgId: access.org.id,
    claSha256: access.org.claTextSha256,
    appBaseUrl,
    actor: {
      userId: access.user.id,
      githubId: access.user.githubId ?? null,
      githubUsername: access.user.githubUsername ?? null,
    },
  })

  await createAuditEvent({
    eventType: "organization.bypass_account_removed",
    orgId: access.org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      bypassAccountId: removed.id,
      bypassKind: removed.bypassKind,
      actorSlug: removed.actorSlug,
      githubUserId: removed.githubUserId,
      githubUsername: removed.githubUsername,
      recheckScheduled: recheck.recheckScheduled,
      recheckRunId: recheck.recheckRunId,
      recheckScheduleError: recheck.recheckScheduleError,
    },
  })

  revalidatePath(`/admin/${orgSlug}`)
  revalidatePath("/admin")

  return { ok: true, ...recheck }
}

async function scheduleClaRecheckForOrg(params: {
  orgSlug: string
  orgId: string
  claSha256: string | null
  appBaseUrl: string
  actor: {
    userId: string
    githubId: string | null
    githubUsername: string | null
  }
}) {
  let recheckRunId: string | null = null
  let recheckScheduleError: string | null = null

  try {
    const run = await start(runClaRecheckWorkflow, [
      {
        orgSlug: params.orgSlug,
        orgId: params.orgId,
        claSha256: params.claSha256,
        appBaseUrl: params.appBaseUrl,
        actor: params.actor,
      },
    ])
    recheckRunId = run.runId
  } catch (error) {
    recheckScheduleError =
      error instanceof Error ? error.message : "Unknown CLA recheck workflow scheduling failure"
    console.error("Failed to schedule CLA recheck workflow:", error)

    await createAuditEvent({
      eventType: "cla.recheck_schedule_failed",
      orgId: params.orgId,
      userId: params.actor.userId,
      actorGithubId: params.actor.githubId,
      actorGithubUsername: params.actor.githubUsername,
      payload: {
        claSha256: params.claSha256,
        error: recheckScheduleError,
      },
    })
  }

  return {
    recheckScheduled: recheckRunId !== null,
    recheckRunId,
    recheckScheduleError,
  }
}
