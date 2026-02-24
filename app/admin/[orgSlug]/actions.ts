"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { recheckOpenPullRequestsAfterClaUpdate } from "@/lib/cla/recheck-open-prs"
import { createAuditEvent, setOrganizationActive, updateOrganizationCla } from "@/lib/db/queries"
import { authorizeOrgAccess } from "@/lib/server/org-access"
import { getBaseUrlFromHeaders } from "@/lib/cla/signing"

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
  const recheckSummary = await recheckOpenPullRequestsAfterClaUpdate({
    orgSlug,
    appBaseUrl: getBaseUrlFromHeaders(headerStore),
    installationId: org.installationId ?? undefined,
  })

  await createAuditEvent({
    eventType: "cla.updated",
    orgId: org.id,
    userId: access.user.id,
    actorGithubId: access.user.githubId ?? null,
    actorGithubUsername: access.user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      recheckSummary,
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
