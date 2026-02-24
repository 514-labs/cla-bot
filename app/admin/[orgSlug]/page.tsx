import { SiteHeader } from "@/components/site-header"
import { OrgManageClient } from "@/components/admin/org-manage-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getArchivesByOrg, getSignerCountsByClaSha, getSignaturesByOrg } from "@/lib/db/queries"
import { authorizeOrgAccess } from "@/lib/server/org-access"

export default async function OrgManagePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const access = await authorizeOrgAccess(orgSlug)

  if (!access.ok) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-xl">
            <CardContent className="py-10 text-center">
              {access.status === 401 ? (
                <>
                  <h1 className="text-2xl font-bold text-foreground">Sign in required</h1>
                  <p className="mt-2 text-muted-foreground">
                    Please sign in with GitHub before managing this organization.
                  </p>
                  <a href={`/api/auth/github?returnTo=${encodeURIComponent(`/admin/${orgSlug}`)}`}>
                    <Button className="mt-4">Sign in with GitHub</Button>
                  </a>
                </>
              ) : access.status === 403 ? (
                <>
                  <h1 className="text-2xl font-bold text-foreground">Access denied</h1>
                  <p className="mt-2 text-muted-foreground">
                    You do not have permission to manage this GitHub installation.
                  </p>
                </>
              ) : access.status === 404 ? (
                <>
                  <h1 className="text-2xl font-bold text-foreground">Organization not found</h1>
                  <p className="mt-2 text-muted-foreground">
                    No organization with slug &quot;{orgSlug}&quot; was found.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-foreground">Unable to verify access</h1>
                  <p className="mt-2 text-muted-foreground">
                    GitHub installation permissions could not be validated right now.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const { org } = access
  const [signers, archives, archiveSignerCounts] = await Promise.all([
    getSignaturesByOrg(org.id),
    getArchivesByOrg(org.id),
    getSignerCountsByClaSha(org.id),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <OrgManageClient
          org={org}
          signers={signers}
          archives={archives}
          archiveSignerCounts={archiveSignerCounts}
          currentClaMarkdown={org.claText}
          currentClaSha256={org.claTextSha256}
        />
      </main>
    </div>
  )
}
