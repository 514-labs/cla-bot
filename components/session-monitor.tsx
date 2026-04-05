"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

type SessionMonitorProps = {
  isAuthenticated: boolean
}

export function SessionMonitor({ isAuthenticated }: SessionMonitorProps) {
  const pathname = usePathname()
  const wasAuthenticated = useRef(isAuthenticated)

  useEffect(() => {
    wasAuthenticated.current = isAuthenticated
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    async function checkSession() {
      try {
        const res = await fetch("/api/auth/session")
        if (!res.ok) return
        const data = await res.json()
        if (!data.user && wasAuthenticated.current) {
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/auth/signin?returnTo=${returnTo}&reason=session_expired`
        }
      } catch {
        // Network error — skip this poll cycle
      }
    }

    const interval = setInterval(checkSession, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  return null
}
