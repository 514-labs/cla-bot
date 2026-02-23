"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { SiteHeader } from "@/components/site-header"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Check,
  FileEdit,
  Github,
  History,
  LinkIcon,
  Loader2,
  Power,
  PowerOff,
  Users,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ClaArchive = {
  id: string
  orgId: string
  sha256: string
  claText: string
  createdAt: string
}

type Signer = {
  id: string
  name: string
  githubUsername: string
  avatarUrl: string
  signedAt: string
  claSha256: string
}

export default function OrgManagePage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const { data, isLoading, mutate } = useSWR(`/api/orgs/${orgSlug}`, fetcher)

  const org = data?.org
  const signatures: Signer[] = data?.signers ?? []
  const archives: ClaArchive[] = data?.archives ?? []
  const currentSha256: string | null = data?.currentClaSha256 ?? null

  const [activeTab, setActiveTab] = useState<"cla" | "signers" | "archives">("cla")
  const [isEditing, setIsEditing] = useState(false)
  const [claContent, setClaContent] = useState("")
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [toggling, setToggling] = useState(false)

  // Sync CLA content from API on first load
  if (data?.currentClaMarkdown && !initialized) {
    setClaContent(data.currentClaMarkdown)
    setInitialized(true)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Organization not found</h1>
            <p className="mt-2 text-muted-foreground">
              No organization with slug &quot;{orgSlug}&quot; was found.
            </p>
            <Link href="/admin">
              <Button variant="outline" className="mt-4 gap-2 bg-transparent">
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // Count how many signers are on the current sha256
  const currentVersionSigners = signatures.filter((s) => s.claSha256 === currentSha256)
  const outdatedSigners = signatures.filter((s) => s.claSha256 !== currentSha256)

  async function handleSave() {
    const res = await fetch(`/api/orgs/${orgSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claMarkdown: claContent }),
    })
    if (res.ok) {
      setSaved(true)
      setIsEditing(false)
      mutate()
      setTimeout(() => setSaved(false), 3000)
    }
  }

  async function handleToggleActive() {
    setToggling(true)
    const res = await fetch(`/api/orgs/${orgSlug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !org.isActive }),
    })
    if (res.ok) {
      mutate()
    }
    setToggling(false)
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/sign/${orgSlug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          {/* Breadcrumb */}
          <Link
            href="/admin"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Admin
          </Link>

          {/* Header */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img
                src={org.avatarUrl || "/placeholder.svg"}
                alt={org.name}
                className="h-14 w-14 rounded-xl"
                crossOrigin="anonymous"
              />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{org.name}</h1>
                  {org.isActive ? (
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-destructive/30 text-destructive">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Github className="h-3 w-3" />
                  {org.githubOrgSlug}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
                onClick={handleToggleActive}
                disabled={toggling}
                data-testid="toggle-active-btn"
              >
                {toggling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : org.isActive ? (
                  <PowerOff className="h-4 w-4" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                {org.isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-primary" />
                    Copied!
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4" />
                    Copy CLA Link
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="signer-count">
                  {signatures.length}
                </p>
                <p className="text-xs text-muted-foreground">Total Signers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-primary" data-testid="current-signer-count">
                  {currentVersionSigners.length}
                </p>
                <p className="text-xs text-muted-foreground">Signed Current CLA</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p
                  className="text-2xl font-bold text-foreground font-mono"
                  data-testid="version-count"
                >
                  {currentSha256 ? currentSha256.slice(0, 7) : "---"}
                </p>
                <p className="text-xs text-muted-foreground">CLA Version</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {new Date(org.installedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Installed</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex gap-1 rounded-lg border bg-secondary p-1">
            <button
              type="button"
              data-testid="tab-cla"
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "cla"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("cla")}
            >
              <FileEdit className="h-4 w-4" />
              CLA Agreement
            </button>
            <button
              type="button"
              data-testid="tab-signers"
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "signers"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("signers")}
            >
              <Users className="h-4 w-4" />
              Signers ({signatures.length})
            </button>
            <button
              type="button"
              data-testid="tab-versions"
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "archives"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("archives")}
            >
              <History className="h-4 w-4" />
              Archives ({archives.length})
            </button>
          </div>

          {/* CLA Tab */}
          {activeTab === "cla" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    CLA Agreement
                    {currentSha256 && (
                      <code className="ml-2 text-xs font-normal text-muted-foreground">
                        {currentSha256.slice(0, 7)}
                      </code>
                    )}
                  </CardTitle>
                  <CardDescription>
                    This is the agreement contributors must sign before their PRs are accepted.
                    Saving creates a new version -- existing signers will need to re-sign.
                  </CardDescription>
                </div>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-transparent"
                    data-testid="edit-cla-btn"
                    onClick={() => setIsEditing(true)}
                  >
                    <FileEdit className="h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false)
                        setClaContent(data?.currentClaMarkdown ?? "")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      data-testid="save-cla-btn"
                      onClick={handleSave}
                    >
                      <Check className="h-4 w-4" />
                      Save as New Version
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {saved && (
                  <div
                    className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary"
                    data-testid="save-success"
                  >
                    New CLA version saved. Existing signers will need to re-sign the updated
                    agreement.
                  </div>
                )}
                {isEditing ? (
                  <div className="space-y-4">
                    <textarea
                      value={claContent}
                      onChange={(e) => setClaContent(e.target.value)}
                      data-testid="cla-editor"
                      className="min-h-[400px] w-full rounded-lg border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Paste your CLA in Markdown format..."
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border bg-background p-6" data-testid="cla-preview">
                    <MarkdownRenderer content={claContent} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Signers Tab */}
          {activeTab === "signers" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signers</CardTitle>
                <CardDescription>
                  Contributors who have signed the CLA for {org.name}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {signatures.length === 0 ? (
                  <div className="py-12 text-center">
                    <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No one has signed the CLA yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1" data-testid="signers-list">
                    {/* Table header */}
                    <div className="grid grid-cols-4 gap-4 border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Contributor</span>
                      <span>GitHub</span>
                      <span>Signed At</span>
                      <span>Version</span>
                    </div>
                    {signatures.map((sig) => {
                      const isOnCurrentVersion = sig.claSha256 === currentSha256
                      return (
                        <div
                          key={sig.id}
                          className="grid grid-cols-4 items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-secondary"
                          data-testid="signer-row"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={sig.avatarUrl || "/placeholder.svg"}
                              alt={sig.name}
                              className="h-8 w-8 rounded-full"
                              crossOrigin="anonymous"
                            />
                            <span className="text-sm font-medium text-foreground">{sig.name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Github className="h-3 w-3" />@{sig.githubUsername}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(sig.signedAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div>
                            {isOnCurrentVersion ? (
                              <Badge
                                variant="outline"
                                className="border-primary/30 text-primary font-mono"
                              >
                                {sig.claSha256.slice(0, 7)}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-amber-500/30 text-amber-500 font-mono"
                              >
                                {sig.claSha256.slice(0, 7)} (outdated)
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {outdatedSigners.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-500">
                    {outdatedSigners.length} signer{outdatedSigners.length > 1 ? "s" : ""} signed an
                    older version and will need to re-sign.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Archives Tab */}
          {activeTab === "archives" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CLA Archives</CardTitle>
                <CardDescription>
                  Snapshots of CLA text at the moment someone signed. Only versions that were
                  actually signed appear here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {archives.length === 0 ? (
                  <div className="py-12 text-center">
                    <History className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No archives yet. Archives are created when someone signs.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3" data-testid="version-list">
                    {archives.map((archive) => {
                      const isCurrent = archive.sha256 === currentSha256
                      const archiveSigners = signatures.filter(
                        (s) => s.claSha256 === archive.sha256
                      )
                      return (
                        <div
                          key={archive.id}
                          className={`rounded-lg border p-4 transition-colors ${
                            isCurrent ? "border-primary/30 bg-primary/5" : "border-border"
                          }`}
                          data-testid="version-row"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <code className="text-sm font-semibold text-foreground">
                                {archive.sha256.slice(0, 7)}
                              </code>
                              {isCurrent && (
                                <Badge className="bg-primary/10 text-primary border-primary/30">
                                  Current
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>
                                {archiveSigners.length} signer
                                {archiveSigners.length !== 1 ? "s" : ""}
                              </span>
                              <span>
                                {new Date(archive.createdAt).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground font-mono">
                            {archive.claText.slice(0, 200)}...
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
