"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error(error)

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-lg rounded-xl border border-white/10 bg-card/80 p-8 text-center">
          <h1 className="font-display text-3xl">Application error</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A critical error occurred while rendering the app shell.
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
      </body>
    </html>
  )
}
