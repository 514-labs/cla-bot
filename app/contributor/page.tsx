import Image from "next/image"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Download, ExternalLink, FileCheck2, Github } from "lucide-react"
import { getSessionUser } from "@/lib/auth"
import { getOrganizations, getSignaturesByUser } from "@/lib/db/queries"

type EnrichedSignature = {
  id: string
  orgId: string
  claSha256: string
  signedAt: string
  orgName: string
  orgSlug: string
  orgAvatarUrl: string
  orgIsActive: boolean
  isLatestForOrg: boolean
  orgHasCurrentSignature: boolean
  orgNeedsResign: boolean
  isCurrentVersion: boolean
  signedVersionLabel: string
  currentVersionLabel: string | null
}

export default async function ContributorPage() {
  const user = await getSessionUser()

  let mySignatures: EnrichedSignature[] = []
  let signedOrgCount = 0
  if (user) {
    const [signatures, allOrgs] = await Promise.all([
      getSignaturesByUser(user.id),
      getOrganizations(),
    ])
    const signaturesBySignedAtDesc = [...signatures].sort((a, b) =>
      b.signedAt.localeCompare(a.signedAt)
    )
    const orgById = new Map(allOrgs.map((org) => [org.id, org]))
    const latestSignatureByOrg = new Map<string, (typeof signaturesBySignedAtDesc)[number]>()
    const orgsWithCurrentSignature = new Set<string>()

    for (const signature of signaturesBySignedAtDesc) {
      if (!latestSignatureByOrg.has(signature.orgId)) {
        latestSignatureByOrg.set(signature.orgId, signature)
      }
      const org = orgById.get(signature.orgId)
      if (org && signature.claSha256 === org.claTextSha256) {
        orgsWithCurrentSignature.add(signature.orgId)
      }
    }

    signedOrgCount = latestSignatureByOrg.size
    mySignatures = signaturesBySignedAtDesc.map((signature) => {
      const org = orgById.get(signature.orgId)
      const isLatestForOrg = latestSignatureByOrg.get(signature.orgId)?.id === signature.id
      const orgHasCurrentSignature = orgsWithCurrentSignature.has(signature.orgId)
      const orgNeedsResign = !orgHasCurrentSignature
      const isCurrentVersion = signature.claSha256 === org?.claTextSha256

      return {
        ...signature,
        orgName: org?.name ?? "Unknown",
        orgSlug: org?.githubOrgSlug ?? "",
        orgAvatarUrl: org?.avatarUrl ?? "",
        orgIsActive: org?.isActive ?? false,
        isLatestForOrg,
        orgHasCurrentSignature,
        orgNeedsResign,
        isCurrentVersion,
        signedVersionLabel: signature.claSha256.slice(0, 7),
        currentVersionLabel: org?.claTextSha256 ? org.claTextSha256.slice(0, 7) : null,
      }
    })
  }

  const outdatedCount = mySignatures.filter(
    (signature) => signature.isLatestForOrg && signature.orgNeedsResign
  ).length

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">My CLAs</h1>
            <p className="mt-1 text-muted-foreground">
              View all the Contributor License Agreements you have signed.
            </p>
          </div>

          {!user ? (
            <Card>
              <CardContent className="py-12 text-center">
                <h3 className="text-lg font-semibold text-foreground">Sign in required</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in with GitHub to view the CLAs you have signed.
                </p>
                <a href="/api/auth/github?returnTo=%2Fcontributor" className="inline-block">
                  <Button className="mt-4 gap-2">
                    <Github className="h-4 w-4" />
                    Sign in with GitHub
                  </Button>
                </a>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="mb-8">
                <CardContent className="flex items-center gap-4 py-4">
                  <Image
                    src={user.avatarUrl || "/placeholder.svg"}
                    alt={user.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full"
                    sizes="40px"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                  </div>
                  <Badge variant="secondary">Contributor</Badge>
                </CardContent>
              </Card>

              {outdatedCount > 0 && (
                <div
                  className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4"
                  data-testid="resign-warning"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {outdatedCount} CLA{outdatedCount > 1 ? "s" : ""} updated since you signed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You will need to re-sign before your next contribution is accepted.
                    </p>
                  </div>
                </div>
              )}

              {mySignatures.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                      <FileCheck2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-foreground">
                      No CLAs signed yet
                    </h3>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      When you open a pull request to a repository that uses CLA Bot, you will be
                      prompted to sign their CLA here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-foreground" data-testid="signed-count">
                    Signed Agreements ({signedOrgCount})
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Full signature history is available below. You can download any previously
                    signed version.
                  </p>

                  {mySignatures.map((signature) => (
                    <Card
                      key={signature.id}
                      className={`transition-colors hover:border-primary/30 ${
                        signature.orgNeedsResign && signature.isLatestForOrg
                          ? "border-amber-500/20"
                          : signature.isLatestForOrg && signature.orgHasCurrentSignature
                            ? "border-primary/30"
                            : ""
                      }`}
                      data-testid="signed-cla-card"
                    >
                      <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <Image
                          src={signature.orgAvatarUrl || "/placeholder.svg"}
                          alt={signature.orgName}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-lg"
                          sizes="48px"
                        />
                        <div className="flex-1">
                          <CardTitle className="text-base">{signature.orgName}</CardTitle>
                          <CardDescription className="flex items-center gap-1">
                            <Github className="h-3 w-3" />
                            {signature.orgSlug}
                          </CardDescription>
                        </div>
                        {signature.orgNeedsResign && signature.isLatestForOrg ? (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                            Re-sign Required
                          </Badge>
                        ) : signature.isLatestForOrg ? (
                          <Badge className="border-primary/30 bg-primary/10 text-primary">
                            Signed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">History</Badge>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-muted-foreground">
                              Signed <code>{signature.signedVersionLabel}</code> on{" "}
                              {new Date(signature.signedAt).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                            {signature.orgNeedsResign && signature.isLatestForOrg && (
                              <p className="text-xs text-amber-500">
                                A newer version
                                {signature.currentVersionLabel
                                  ? ` (${signature.currentVersionLabel})`
                                  : ""}{" "}
                                has been published.
                              </p>
                            )}
                            {!signature.isLatestForOrg && (
                              <p className="text-xs text-muted-foreground">
                                Historical signature record.
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/contributor/signatures/${encodeURIComponent(
                                signature.id
                              )}/download`}
                            >
                              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                                Download
                                <Download className="h-3 w-3" />
                              </Button>
                            </a>
                            <Link href={`/sign/${signature.orgSlug}`}>
                              <Button
                                variant={
                                  signature.orgNeedsResign && signature.isLatestForOrg
                                    ? "outline"
                                    : "ghost"
                                }
                                size="sm"
                                className={`gap-2 ${
                                  signature.orgNeedsResign && signature.isLatestForOrg
                                    ? "border-amber-500/30 bg-transparent text-amber-500 hover:bg-amber-500/10"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {signature.orgNeedsResign && signature.isLatestForOrg
                                  ? "Re-sign"
                                  : "View CLA"}
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
