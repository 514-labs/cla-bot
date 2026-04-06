/**
 * GitHub Marketplace webhook handler.
 *
 * Receives `marketplace_purchase` events when users purchase, change,
 * or cancel a plan on the GitHub Marketplace listing.
 *
 * - Verifies x-hub-signature-256 using GITHUB_MARKETPLACE_WEBHOOK_SECRET.
 * - Logs every event to the audit trail for billing visibility.
 */

import { type NextRequest, NextResponse } from "next/server"
import { verifyWebhookSignatureFromEnv } from "@/lib/github/webhook-signature"
import { createAuditEvent } from "@/lib/db/queries"

type MarketplacePurchase = {
  account?: {
    type?: string
    id?: number
    login?: string
    organization_billing_email?: string
  }
  plan?: {
    id?: number
    name?: string
    description?: string
    monthly_price_in_cents?: number
    yearly_price_in_cents?: number
    price_model?: string
    unit_name?: string | null
    bullets?: string[]
  }
  unit_count?: number
  on_free_trial?: boolean
  free_trial_ends_on?: string | null
  next_billing_date?: string | null
}

type MarketplacePayload = {
  action: string
  effective_date?: string
  marketplace_purchase?: MarketplacePurchase
  previous_marketplace_purchase?: MarketplacePurchase
  sender?: {
    login?: string
    id?: number
    type?: string
  }
}

const VALID_ACTIONS = new Set([
  "purchased",
  "changed",
  "cancelled",
  "pending_change",
  "pending_change_cancelled",
])

export async function POST(request: NextRequest) {
  const rawPayload = await request.text()

  const signatureError = verifyWebhookSignatureFromEnv(
    rawPayload,
    request.headers.get("x-hub-signature-256"),
    "GITHUB_MARKETPLACE_WEBHOOK_SECRET"
  )
  if (signatureError) return signatureError

  let payload: MarketplacePayload
  try {
    payload = JSON.parse(rawPayload) as MarketplacePayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const event = request.headers.get("x-github-event")
  if (event !== "marketplace_purchase") {
    return NextResponse.json({ ok: true, skipped: true, reason: `unhandled event: ${event}` })
  }

  const { action } = payload
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ ok: true, skipped: true, reason: `unhandled action: ${action}` })
  }

  const account = payload.marketplace_purchase?.account
  const plan = payload.marketplace_purchase?.plan
  const sender = payload.sender

  await createAuditEvent({
    eventType: `marketplace.${action}`,
    actorGithubId: sender?.id ? String(sender.id) : null,
    actorGithubUsername: sender?.login ?? null,
    payload: {
      action,
      effectiveDate: payload.effective_date ?? null,
      account: account
        ? {
            type: account.type,
            id: account.id,
            login: account.login,
          }
        : null,
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            priceModel: plan.price_model,
            monthlyPriceInCents: plan.monthly_price_in_cents,
          }
        : null,
      previousPlan: payload.previous_marketplace_purchase?.plan
        ? {
            id: payload.previous_marketplace_purchase.plan.id,
            name: payload.previous_marketplace_purchase.plan.name,
          }
        : null,
      onFreeTrial: payload.marketplace_purchase?.on_free_trial ?? null,
      freeTrialEndsOn: payload.marketplace_purchase?.free_trial_ends_on ?? null,
    },
  })

  console.log(
    `[marketplace] ${action} — account=${account?.login ?? "unknown"} plan=${plan?.name ?? "unknown"} sender=${sender?.login ?? "unknown"}`
  )

  return NextResponse.json({ ok: true, action })
}
