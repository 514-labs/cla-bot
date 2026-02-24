import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SignClaClient } from "@/components/sign/sign-cla-client"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { getSessionUser } from "@/lib/auth"
import { getOrganizationBySlug, getSignatureStatus } from "@/lib/db/queries"

export default async function SignClaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ repo?: string; pr?: string }>
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams])
  const repoName = typeof query.repo === "string" ? query.repo : null
  const prNumber = typeof query.pr === "string" ? query.pr : null

  const org = await getOrganizationBySlug(orgSlug)

  if (!org) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Organization not found</h1>
            <p className="mt-2 text-muted-foreground">
              No CLA found for organization &quot;{orgSlug}&quot;.
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-4 gap-2 bg-transparent">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const user = await getSessionUser()
  if (!user) {
    const queryParams = new URLSearchParams()
    if (repoName) queryParams.set("repo", repoName)
    if (prNumber) queryParams.set("pr", prNumber)
    const returnTo = `/sign/${orgSlug}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`

    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Sign in required</h1>
            <p className="mt-2 text-muted-foreground">
              Please sign in with GitHub before signing this CLA.
            </p>
            <a href={`/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`}>
              <Button className="mt-4">Sign in with GitHub</Button>
            </a>
          </div>
        </main>
      </div>
    )
  }

  const status = await getSignatureStatus(orgSlug, user.id)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <SignClaClient
          org={{
            name: org.name,
            githubOrgSlug: org.githubOrgSlug,
            claMarkdown: org.claText,
            isActive: org.isActive,
          }}
          user={{
            name: user.name,
            githubUsername: user.githubUsername,
            avatarUrl: user.avatarUrl,
          }}
          orgSlug={orgSlug}
          repoName={repoName}
          prNumber={prNumber}
          alreadySigned={status.signed && status.currentVersion}
          needsResign={status.signed && !status.currentVersion}
          existingSignature={
            status.signature
              ? {
                  signedAt: status.signature.signedAt,
                }
              : null
          }
          currentSha256={org.claTextSha256}
          signedSha256={status.signature?.claSha256 ?? null}
        />
      </main>
    </div>
  )
}
