"use client"

import { useMemo, useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { toggleOrganizationActiveAction, updateClaAction } from "@/app/admin/[orgSlug]/actions"

type ClaArchive = {
  id: string
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

type ManagedOrg = {
  id: string
  name: string
  avatarUrl: string
  githubOrgSlug: string
  isActive: boolean
  installedAt: string
}

type OrgManageClientProps = {
  org: ManagedOrg
  signers: Signer[]
  archives: ClaArchive[]
  currentClaMarkdown: string
  currentClaSha256: string | null
}

export function OrgManageClient({
  org,
  signers,
  archives,
  currentClaMarkdown,
  currentClaSha256,
}: OrgManageClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"cla" | "signers" | "archives">("cla")
  const [isEditing, setIsEditing] = useState(false)
  const [claContent, setClaContent] = useState(currentClaMarkdown)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()
  const [isTogglingActive, startToggleActiveTransition] = useTransition()

  const currentVersionSigners = useMemo(
    () => signers.filter((signature) => signature.claSha256 === currentClaSha256),
    [signers, currentClaSha256]
  )

  const outdatedSigners = useMemo(
    () => signers.filter((signature) => signature.claSha256 !== currentClaSha256),
    [signers, currentClaSha256]
  )
  const hasConfiguredCla = Boolean(currentClaSha256 && currentClaMarkdown.trim().length > 0)

  function handleSave() {
    startSaveTransition(async () => {
      setError(null)
      const result = await updateClaAction({ orgSlug: org.githubOrgSlug, claMarkdown: claContent })
      if (!result.ok) {
        setError(result.error ?? "Failed to save CLA")
        return
      }

      setSaved(true)
      setIsEditing(false)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    })
  }

  function handleToggleActive() {
    startToggleActiveTransition(async () => {
      setError(null)
      const result = await toggleOrganizationActiveAction({
        orgSlug: org.githubOrgSlug,
        isActive: !org.isActive,
      })

      if (!result.ok) {
        setError(result.error ?? "Failed to update activation status")
        return
      }

      router.refresh()
    })
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/sign/${org.githubOrgSlug}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Admin
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Image
            src={org.avatarUrl || "/placeholder.svg"}
            alt={org.name}
            width={56}
            height={56}
            className="h-14 w-14 rounded-xl"
            sizes="56px"
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
            disabled={isTogglingActive || isSaving}
            data-testid="toggle-active-btn"
          >
            {isTogglingActive ? (
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

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-foreground" data-testid="signer-count">
              {signers.length}
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
            <p className="font-mono text-2xl font-bold text-foreground" data-testid="version-count">
              {currentClaSha256 ? currentClaSha256.slice(0, 7) : "unset"}
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

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mb-8 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
        Enforcement note: configure GitHub branch protection or rulesets to require the status check{" "}
        <code>CLA Bot / Contributor License Agreement</code> on protected branches.
      </div>

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
          Signers ({signers.length})
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

      {activeTab === "cla" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                CLA Agreement
                {currentClaSha256 && (
                  <code className="ml-2 text-xs font-normal text-muted-foreground">
                    {currentClaSha256.slice(0, 7)}
                  </code>
                )}
              </CardTitle>
              <CardDescription>
                {hasConfiguredCla
                  ? "This is the agreement contributors must sign before their PRs are accepted. Saving creates a new version; existing signers will need to re-sign."
                  : "No CLA is configured yet. Publish your own CLA below to start enforcement."}
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
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditing(false)
                    setClaContent(currentClaMarkdown)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  data-testid="save-cla-btn"
                  onClick={handleSave}
                  disabled={isSaving || isTogglingActive}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {isSaving ? "Saving..." : "Save as New Version"}
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
                New CLA version saved. Existing signers will need to re-sign the updated agreement.
                GitHub PR checks/comments are updating in the background.
              </div>
            )}

            {isSaving && (
              <div className="mb-4 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
                Saving CLA and rechecking open pull requests. This can take a few seconds.
              </div>
            )}

            {isEditing ? (
              <textarea
                value={claContent}
                onChange={(event) => setClaContent(event.target.value)}
                data-testid="cla-editor"
                className="min-h-[400px] w-full rounded-lg border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Paste your CLA in Markdown format..."
              />
            ) : (
              <div className="rounded-lg border bg-background p-6" data-testid="cla-preview">
                {hasConfiguredCla ? (
                  <MarkdownRenderer content={claContent} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No CLA configured yet. Click <strong>Edit</strong> and paste your own CLA in
                    Markdown.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "signers" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signers</CardTitle>
            <CardDescription>Contributors who have signed the CLA for {org.name}.</CardDescription>
          </CardHeader>
          <CardContent>
            {signers.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No one has signed the CLA yet.</p>
              </div>
            ) : (
              <div className="space-y-1" data-testid="signers-list">
                <div className="grid grid-cols-4 gap-4 border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Contributor</span>
                  <span>GitHub</span>
                  <span>Signed At</span>
                  <span>Version</span>
                </div>

                {signers.map((signature) => {
                  const isOnCurrentVersion = signature.claSha256 === currentClaSha256
                  return (
                    <div
                      key={signature.id}
                      className="grid grid-cols-4 items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-secondary"
                      data-testid="signer-row"
                    >
                      <div className="flex items-center gap-3">
                        <Image
                          src={signature.avatarUrl || "/placeholder.svg"}
                          alt={signature.name}
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-full"
                          sizes="32px"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {signature.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Github className="h-3 w-3" />@{signature.githubUsername}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(signature.signedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div>
                        {isOnCurrentVersion ? (
                          <Badge
                            variant="outline"
                            className="border-primary/30 font-mono text-primary"
                          >
                            {signature.claSha256.slice(0, 7)}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 font-mono text-amber-500"
                          >
                            {signature.claSha256.slice(0, 7)} (outdated)
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

      {activeTab === "archives" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CLA Archives</CardTitle>
            <CardDescription>
              Snapshots of CLA text at the moment someone signed. Only versions that were actually
              signed appear here.
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
                  const isCurrent = archive.sha256 === currentClaSha256
                  const archiveSigners = signers.filter(
                    (signature) => signature.claSha256 === archive.sha256
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
                            <Badge className="border-primary/30 bg-primary/10 text-primary">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            {archiveSigners.length} signer{archiveSigners.length !== 1 ? "s" : ""}
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
                      <p className="mt-2 line-clamp-2 font-mono text-xs text-muted-foreground">
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
  )
}
