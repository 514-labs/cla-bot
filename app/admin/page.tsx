import Image from "next/image"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Github, Plus, Building2, ArrowRight } from "lucide-react"
import { getSessionUser } from "@/lib/auth"
import { getOrganizations } from "@/lib/db/queries"
import { filterInstalledOrganizationsForAdmin } from "@/lib/github/admin-authorization"

export default async function AdminPage() {
  const user = await getSessionUser()

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">
          <div className="mx-auto max-w-4xl px-4 py-12">
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
          </div>
        </main>
      </div>
    )
  }

  let hasApiError = false
  let orgs: Awaited<ReturnType<typeof getOrganizations>> = []
  let installedOrgsCount = 0
  const installHref = getInstallLink("/admin")

  try {
    const allOrgs = await getOrganizations()
    installedOrgsCount = allOrgs.filter((org) => org.installationId !== null).length
    orgs = await filterInstalledOrganizationsForAdmin(user, allOrgs)
  } catch {
    hasApiError = true
  }

  const hasInstalledOrgs = installedOrgsCount > 0

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Admin Dashboard</h1>
              <p className="mt-1 text-muted-foreground">
                Manage CLAs for your GitHub organizations and personal accounts.
              </p>
            </div>
            <a href={installHref}>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Install on GitHub Account
              </Button>
            </a>
          </div>

          {hasApiError ? (
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
                  <Badge variant="secondary">Admin</Badge>
                </CardContent>
              </Card>

              {orgs.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-foreground">
                      {hasInstalledOrgs ? "No accessible organizations" : "No organizations yet"}
                    </h3>
                    <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                      {hasInstalledOrgs
                        ? "We found an installation, but your account is not recognized as an admin for any installed GitHub account."
                        : "Install the CLA Bot GitHub App on your organization or personal account to get started."}
                    </p>
                    <a href={installHref}>
                      <Button className="gap-2">
                        <Github className="h-4 w-4" />
                        Install GitHub App
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-foreground">Your Organizations</h2>
                  {orgs.map((org) => (
                    <Card key={org.id} className="transition-colors hover:border-primary/30">
                      <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <Image
                          src={org.avatarUrl || "/placeholder.svg"}
                          alt={org.name}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-lg"
                          sizes="48px"
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
                            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                              Manage
                              <ArrowRight className="h-3 w-3" />
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
        </div>
      </main>
    </div>
  )
}

function getInstallLink(returnTo: string) {
  return `/api/github/install?returnTo=${encodeURIComponent(returnTo)}`
}
