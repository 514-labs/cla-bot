"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

type InstallSyncPollerProps = {
  enabled: boolean
}

export function InstallSyncPoller({ enabled }: InstallSyncPollerProps) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    let attempts = 0
    const maxAttempts = 8
    const interval = window.setInterval(() => {
      attempts += 1
      router.refresh()
      if (attempts >= maxAttempts) {
        window.clearInterval(interval)
      }
    }, 1500)

    return () => {
      window.clearInterval(interval)
    }
  }, [enabled, router])

  return null
}
