"use client"

import type React from "react"
import { ConsentManagerProvider, CookieBanner, ConsentManagerDialog } from "@c15t/nextjs"

const backendURL = process.env.NEXT_PUBLIC_C15T_URL

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConsentManagerProvider
      options={{
        mode: backendURL ? "c15t" : "offline",
        backendURL,
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
