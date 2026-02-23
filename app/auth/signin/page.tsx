import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileCheck2, Github } from "lucide-react"
import Link from "next/link"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const params = await searchParams
  const returnTo = sanitizeReturnTo(params.returnTo ?? null, "/dashboard")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <FileCheck2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">CLA Bot</span>
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            Sign in with your GitHub account to manage or sign CLAs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a href={`/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`} className="block">
            <Button className="w-full gap-2" size="lg">
              <Github className="h-5 w-5" />
              Continue with GitHub
            </Button>
          </a>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            We only request access to your public profile and organization membership.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function sanitizeReturnTo(raw: string | null, fallback: string): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}
