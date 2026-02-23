"use client"

import useSWR from "swr"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileCheck2, Github, ExternalLink, Loader2, AlertTriangle } from "lucide-react"
import Link from "next/link"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type EnrichedSignature = {
  id: string
  orgId: string
  signedAt: string
  orgName: string
  orgSlug: string
  orgAvatarUrl: string
  orgIsActive: boolean
  isCurrentVersion: boolean
  signedVersionLabel: string
}

export default function ContributorPage() {
  const { data, isLoading } = useSWR("/api/contributor", fetcher)

  const user = data?.user
  const mySignatures: EnrichedSignature[] = data?.signatures ?? []

  const outdatedCount = mySignatures.filter((s) => !s.isCurrentVersion).length

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">My CLAs</h1>
            <p className="mt-1 text-muted-foreground">
              View all the Contributor License Agreements you have signed.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {data?.error === "Unauthorized" && (
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
              )}

              {data?.error !== "Unauthorized" && (
                <>
                  {/* Signed in as */}
                  {user && (
                    <Card className="mb-8">
                      <CardContent className="flex items-center gap-4 py-4">
                        <img
                          src={user.avatarUrl || "/placeholder.svg"}
                          alt={user.name}
                          className="h-10 w-10 rounded-full"
                          crossOrigin="anonymous"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                        </div>
                        <Badge variant="secondary">Contributor</Badge>
                      </CardContent>
                    </Card>
                  )}

                  {/* Re-sign warning */}
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

                  {/* Signed CLAs */}
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
                          When you open a pull request to a repository that uses CLA Bot, you will
                          be prompted to sign their CLA here.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      <h2
                        className="text-lg font-semibold text-foreground"
                        data-testid="signed-count"
                      >
                        Signed Agreements ({mySignatures.length})
                      </h2>
                      {mySignatures.map((sig) => (
                        <Card
                          key={sig.id}
                          className={`transition-colors hover:border-primary/30 ${
                            !sig.isCurrentVersion ? "border-amber-500/20" : ""
                          }`}
                          data-testid="signed-cla-card"
                        >
                          <CardHeader className="flex flex-row items-center gap-4 pb-2">
                            <img
                              src={sig.orgAvatarUrl || "/placeholder.svg"}
                              alt={sig.orgName}
                              className="h-12 w-12 rounded-lg"
                              crossOrigin="anonymous"
                            />
                            <div className="flex-1">
                              <CardTitle className="text-base">{sig.orgName}</CardTitle>
                              <CardDescription className="flex items-center gap-1">
                                <Github className="h-3 w-3" />
                                {sig.orgSlug}
                              </CardDescription>
                            </div>
                            {sig.isCurrentVersion ? (
                              <Badge className="border-primary/30 bg-primary/10 text-primary">
                                Signed
                              </Badge>
                            ) : (
                              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                                Re-sign Required
                              </Badge>
                            )}
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col gap-0.5">
                                <p className="text-xs text-muted-foreground">
                                  Signed <code>{sig.signedVersionLabel}</code> on{" "}
                                  {new Date(sig.signedAt).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })}
                                </p>
                                {!sig.isCurrentVersion && (
                                  <p className="text-xs text-amber-500">
                                    A newer version has been published.
                                  </p>
                                )}
                              </div>
                              <Link href={`/sign/${sig.orgSlug}`}>
                                <Button
                                  variant={sig.isCurrentVersion ? "ghost" : "outline"}
                                  size="sm"
                                  className={`gap-2 ${sig.isCurrentVersion ? "text-muted-foreground" : "border-amber-500/30 text-amber-500 bg-transparent hover:bg-amber-500/10"}`}
                                >
                                  {sig.isCurrentVersion ? "View CLA" : "Re-sign"}
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
