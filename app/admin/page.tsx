"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import useSWR from "swr"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Github, Plus, Building2, ArrowRight, Loader2 } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function AdminPage() {
  const { data, isLoading } = useSWR("/api/orgs", fetcher)
  const installRedirectedRef = useRef(false)

  const user = data?.user
  const orgs = data?.orgs ?? []
  const installedOrgsCount =
    typeof data?.installedOrgsCount === "number" ? data.installedOrgsCount : 0
  const hasInstalledOrgs = installedOrgsCount > 0
  const hasApiError = Boolean(data?.error)
  const isUnauthorized = data?.error === "Unauthorized"

  useEffect(() => {
    if (isLoading) return
    if (installRedirectedRef.current) return
    if (!data) return
    if (hasApiError || !Array.isArray(data.orgs)) return
    if (data.orgs.length > 0) return
    if (typeof data.installedOrgsCount === "number" && data.installedOrgsCount > 0) return

    installRedirectedRef.current = true
    window.location.href = "/api/github/install?returnTo=%2Fadmin"
  }, [data, hasApiError, isLoading])

  function handleInstall() {
    window.location.href = "/api/github/install?returnTo=%2Fadmin"
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Admin Dashboard</h1>
              <p className="mt-1 text-muted-foreground">
                Manage CLAs for your GitHub organizations and personal accounts.
              </p>
            </div>
            <Button className="gap-2" onClick={handleInstall}>
              <Plus className="h-4 w-4" />
              Install on GitHub Account
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {isUnauthorized && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <h3 className="text-lg font-semibold text-foreground">Sign in required</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sign in with GitHub to manage account CLAs.
                    </p>
                    <a href="/api/auth/github?returnTo=%2Fadmin" className="inline-block">
                      <Button className="mt-4 gap-2">
                        <Github className="h-4 w-4" />
                        Sign in with GitHub
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              )}

              {hasApiError && !isUnauthorized && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <h3 className="text-lg font-semibold text-foreground">
                      Unable to verify organization access
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We could not verify your GitHub organization admin access. Try refreshing or
                      signing out and back in.
                    </p>
                  </CardContent>
                </Card>
              )}

              {!hasApiError && (
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
                        <Badge variant="secondary">Admin</Badge>
                      </CardContent>
                    </Card>
                  )}

                  {/* Organizations */}
                  {orgs.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold text-foreground">
                          {hasInstalledOrgs
                            ? "No accessible organizations"
                            : "No organizations yet"}
                        </h3>
                        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                          {hasInstalledOrgs
                            ? "We found an installation, but your account is not recognized as an admin for any installed GitHub account."
                            : "Install the CLA Bot GitHub App on your organization or personal account to get started."}
                        </p>
                        <Button className="gap-2" onClick={handleInstall}>
                          <Github className="h-4 w-4" />
                          Install GitHub App
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold text-foreground">Your Organizations</h2>
                      {orgs.map(
                        (org: {
                          id: string
                          avatarUrl: string
                          name: string
                          githubOrgSlug: string
                          installedAt: string
                          isActive: boolean
                        }) => (
                          <Card key={org.id} className="transition-colors hover:border-primary/30">
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                              <img
                                src={org.avatarUrl || "/placeholder.svg"}
                                alt={org.name}
                                className="h-12 w-12 rounded-lg"
                                crossOrigin="anonymous"
                              />
                              <div className="flex-1">
                                <CardTitle className="text-base">{org.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1">
                                  <Github className="h-3 w-3" />
                                  {org.githubOrgSlug}
                                </CardDescription>
                              </div>
                              {org.isActive ? (
                                <Badge variant="outline" className="border-primary/30 text-primary">
                                  Active
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="border-muted-foreground/30 text-muted-foreground"
                                >
                                  Inactive
                                </Badge>
                              )}
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  Installed{" "}
                                  {new Date(org.installedAt).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })}
                                </p>
                                <Link href={`/admin/${org.githubOrgSlug}`}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 bg-transparent"
                                  >
                                    Manage
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                </Link>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      )}
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
