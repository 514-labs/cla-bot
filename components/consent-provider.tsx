"use client"

import type React from "react"
import { ConsentManagerProvider, CookieBanner, ConsentManagerDialog } from "@c15t/nextjs"

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConsentManagerProvider
      options={{
        mode: "c15t",
        backendURL: process.env.NEXT_PUBLIC_C15T_URL,
        legalLinks: {
          privacyPolicy: { href: "/privacy" },
          termsOfService: { href: "/terms" },
        },
      }}
    >
      {children}
      <CookieBanner />
      <ConsentManagerDialog />
    </ConsentManagerProvider>
  )
}
