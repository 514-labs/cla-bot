import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-card/80 p-8 text-center">
        <h1 className="font-display text-3xl text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you requested does not exist or has moved.
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button>Back to homepage</Button>
        </Link>
      </div>
    </div>
  )
}
