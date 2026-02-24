"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-card/80 p-8 text-center">
        <h1 className="font-display text-3xl text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page encountered an unexpected error. You can retry or go back home.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Link href="/">
            <Button variant="outline" className="bg-transparent">
              Go home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
