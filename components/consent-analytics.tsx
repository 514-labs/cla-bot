"use client"

import { useConsentManager } from "@c15t/nextjs"
import { Analytics } from "@vercel/analytics/next"

export function ConsentAnalytics() {
  const { hasConsentFor } = useConsentManager()

  if (!hasConsentFor("measurement")) {
    return null
  }

  return <Analytics />
}
