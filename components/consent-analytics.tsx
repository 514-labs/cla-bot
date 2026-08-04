"use client"

import { useConsentManager } from "@c15t/nextjs"
import { Analytics } from "@vercel/analytics/react"

export function ConsentAnalytics() {
  const { has } = useConsentManager()

  if (!has("measurement")) {
    return null
  }

  return <Analytics />
}
