"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ORG_MANAGE_DEFAULT_TAB,
  type OrgManageTab,
  parseOrgManageTab,
} from "@/lib/admin/org-manage-tabs"
import {
  ArrowLeft,
  Check,
  Download,
  FileEdit,
  Github,
  History,
  Search,
  LinkIcon,
  Loader2,
  Power,
  PowerOff,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import {
  addBypassAccountAction,
  removeBypassAccountAction,
  toggleOrganizationActiveAction,
  updateClaAction,
} from "@/app/admin/[orgSlug]/actions"

type ClaArchive = {
  id: string
  sha256: string
  claText: string
  createdAt: string
}

type Signer = {
  id: string
  userId: string
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

type BypassAccount = {
  id: string
  bypassKind: string
  githubUserId: string | null
  githubUsername: string
  actorSlug: string | null
  createdAt: string
}

type UserBypassSuggestion = {
  kind: "user"
  githubUserId: string
  githubUsername: string
  avatarUrl: string
  type: "User" | "Organization" | "Bot"
  alreadyBypassed: boolean
}

type AppBotBypassSuggestion = {
  kind: "app_bot"
  actorSlug: string
  githubUsername: string
  avatarUrl: string
  type: "Bot"
  source: "github" | "manual"
  alreadyBypassed: boolean
}

type ClaEditViewMode = "edit" | "split" | "preview"

type OrgManageClientProps = {
  org: ManagedOrg
  signers: Signer[]
  archives: ClaArchive[]
  archiveSignerCounts: Record<string, number>
  bypassAccounts: BypassAccount[]
  currentClaMarkdown: string
  currentClaSha256: string | null
  initialTab: OrgManageTab
}

export function OrgManageClient({
  org,
  signers,
  archives,
  archiveSignerCounts,
  bypassAccounts,
  currentClaMarkdown,
  currentClaSha256,
  initialTab,
}: OrgManageClientProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<OrgManageTab>(initialTab)
  const [isEditing, setIsEditing] = useState(false)
  const [claEditViewMode, setClaEditViewMode] = useState<ClaEditViewMode>("split")
  const [claContent, setClaContent] = useState(currentClaMarkdown)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userBypassQuery, setUserBypassQuery] = useState("")
  const [selectedUserBypassSuggestion, setSelectedUserBypassSuggestion] =
    useState<UserBypassSuggestion | null>(null)
  const [userBypassSuggestions, setUserBypassSuggestions] = useState<UserBypassSuggestion[]>([])
  const [highlightedUserBypassSuggestionIndex, setHighlightedUserBypassSuggestionIndex] =
    useState(-1)
  const [isSearchingUserBypass, setIsSearchingUserBypass] = useState(false)
  const [userBypassSuggestError, setUserBypassSuggestError] = useState<string | null>(null)
  const [appBotBypassQuery, setAppBotBypassQuery] = useState("")
  const [selectedAppBotBypassSuggestion, setSelectedAppBotBypassSuggestion] =
    useState<AppBotBypassSuggestion | null>(null)
  const [appBotBypassSuggestions, setAppBotBypassSuggestions] = useState<AppBotBypassSuggestion[]>(
    []
  )
  const [highlightedAppBotBypassSuggestionIndex, setHighlightedAppBotBypassSuggestionIndex] =
    useState(-1)
  const [isSearchingAppBotBypass, setIsSearchingAppBotBypass] = useState(false)
  const [appBotBypassSuggestError, setAppBotBypassSuggestError] = useState<string | null>(null)
  const [bypassNotice, setBypassNotice] = useState<{
    tone: "success" | "warning"
    message: string
  } | null>(null)
  const [isSaving, startSaveTransition] = useTransition()
  const [isTogglingActive, startToggleActiveTransition] = useTransition()
  const [isAddingBypass, startAddBypassTransition] = useTransition()
  const [isRemovingBypass, startRemoveBypassTransition] = useTransition()

  const currentVersionSigners = useMemo(
    () =>
      signers.filter(
        (signature) => Boolean(currentClaSha256) && signature.claSha256 === currentClaSha256
      ),
    [signers, currentClaSha256]
  )

  const outdatedSigners = useMemo(
    () =>
      signers.filter((signature) => !currentClaSha256 || signature.claSha256 !== currentClaSha256),
    [signers, currentClaSha256]
  )
  const userBypassAccounts = useMemo(
    () => bypassAccounts.filter((entry) => entry.bypassKind === "user"),
    [bypassAccounts]
  )
  const appBotBypassAccounts = useMemo(
    () => bypassAccounts.filter((entry) => entry.bypassKind === "app_bot"),
    [bypassAccounts]
  )
  const hasConfiguredCla = Boolean(currentClaSha256 && currentClaMarkdown.trim().length > 0)
  const isMutating = isSaving || isTogglingActive || isAddingBypass || isRemovingBypass
  const effectiveClaEditViewMode: ClaEditViewMode =
    isMobile && claEditViewMode === "split" ? "edit" : claEditViewMode

  useEffect(() => {
    const tabFromQuery = parseOrgManageTab(searchParams.get("tab")) ?? ORG_MANAGE_DEFAULT_TAB
    setActiveTab((currentTab) => (currentTab === tabFromQuery ? currentTab : tabFromQuery))
  }, [searchParams])

  useEffect(() => {
    if (activeTab !== "bypass") return

    const normalizedQuery = userBypassQuery.trim().replace(/^@/, "")
    if (normalizedQuery.length < 2) {
      setUserBypassSuggestions([])
      setUserBypassSuggestError(null)
      setHighlightedUserBypassSuggestionIndex(-1)
      setIsSearchingUserBypass(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsSearchingUserBypass(true)
      setUserBypassSuggestError(null)
      try {
        const response = await fetch(
          `/api/admin/orgs/${encodeURIComponent(org.githubOrgSlug)}/bypass/suggest?kind=user&q=${encodeURIComponent(normalizedQuery)}`,
          {
            method: "GET",
            signal: controller.signal,
          }
        )

        const payload = (await response.json()) as {
          error?: string
          suggestions?: UserBypassSuggestion[]
        }
        if (!response.ok) {
          setUserBypassSuggestions([])
          setUserBypassSuggestError(payload.error ?? "Failed to load suggestions")
          setHighlightedUserBypassSuggestionIndex(-1)
          return
        }
        const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : []
        setUserBypassSuggestions(suggestions)
        setHighlightedUserBypassSuggestionIndex(suggestions.length > 0 ? 0 : -1)
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return
        setUserBypassSuggestions([])
        setUserBypassSuggestError("Failed to load suggestions")
        setHighlightedUserBypassSuggestionIndex(-1)
      } finally {
        setIsSearchingUserBypass(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [activeTab, userBypassQuery, org.githubOrgSlug])

  useEffect(() => {
    if (activeTab !== "bypass") return

    const normalizedQuery = appBotBypassQuery.trim().replace(/^@/, "")
    if (normalizedQuery.length < 2) {
      setAppBotBypassSuggestions([])
      setAppBotBypassSuggestError(null)
      setHighlightedAppBotBypassSuggestionIndex(-1)
      setIsSearchingAppBotBypass(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsSearchingAppBotBypass(true)
      setAppBotBypassSuggestError(null)
      try {
        const response = await fetch(
          `/api/admin/orgs/${encodeURIComponent(org.githubOrgSlug)}/bypass/suggest?kind=app_bot&q=${encodeURIComponent(normalizedQuery)}`,
          {
            method: "GET",
            signal: controller.signal,
          }
        )

        const payload = (await response.json()) as {
          error?: string
          suggestions?: AppBotBypassSuggestion[]
        }
        if (!response.ok) {
          setAppBotBypassSuggestions([])
          setAppBotBypassSuggestError(payload.error ?? "Failed to load suggestions")
          setHighlightedAppBotBypassSuggestionIndex(-1)
          return
        }
        const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : []
        setAppBotBypassSuggestions(suggestions)
        setHighlightedAppBotBypassSuggestionIndex(suggestions.length > 0 ? 0 : -1)
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return
        setAppBotBypassSuggestions([])
        setAppBotBypassSuggestError("Failed to load suggestions")
        setHighlightedAppBotBypassSuggestionIndex(-1)
      } finally {
        setIsSearchingAppBotBypass(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [activeTab, appBotBypassQuery, org.githubOrgSlug])

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
      const nextIsActive = !org.isActive
      const result = await toggleOrganizationActiveAction({
        orgSlug: org.githubOrgSlug,
        isActive: nextIsActive,
      })

      if (!result.ok) {
        setError(result.error ?? "Failed to update activation status")
        return
      }

      if (result.recheckScheduleError) {
        setError(
          nextIsActive
            ? "Organization activated, but async PR recheck scheduling failed."
            : "Organization deactivated, but async PR recheck scheduling failed."
        )
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

  function buildTabHref(tab: OrgManageTab) {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("tab", tab)
    return `${pathname}?${nextParams.toString()}`
  }

  function handleTabChange(nextTab: OrgManageTab) {
    if (nextTab === activeTab) return
    router.push(buildTabHref(nextTab), { scroll: false })
  }

  function handleAddUserBypassAccount(suggestionOverride?: UserBypassSuggestion) {
    const suggestionToAdd = suggestionOverride ?? selectedUserBypassSuggestion
    if (!suggestionToAdd) {
      setError("Select a user from suggestions before adding to bypass")
      return
    }

    startAddBypassTransition(async () => {
      setError(null)
      setBypassNotice(null)
      const result = await addBypassAccountAction({
        orgSlug: org.githubOrgSlug,
        bypassKind: "user",
        githubUserId: suggestionToAdd.githubUserId,
        githubUsername: suggestionToAdd.githubUsername,
      })

      if (!result.ok) {
        setError(result.error ?? "Failed to add bypass account")
        return
      }

      setUserBypassQuery("")
      setSelectedUserBypassSuggestion(null)
      setUserBypassSuggestions([])
      setHighlightedUserBypassSuggestionIndex(-1)
      setUserBypassSuggestError(null)
      setBypassNotice({
        tone: result.recheckScheduleError ? "warning" : "success",
        message: result.recheckScheduleError
          ? "Bypass user added, but open PR recheck scheduling failed."
          : "Bypass user added. Open PR checks/comments are updating in the background.",
      })
      router.refresh()
    })
  }

  function handleAddAppBotBypassAccount(suggestionOverride?: AppBotBypassSuggestion) {
    const suggestionToAdd = suggestionOverride ?? selectedAppBotBypassSuggestion
    if (!suggestionToAdd) {
      setError("Select an app or bot from suggestions before adding to bypass")
      return
    }

    startAddBypassTransition(async () => {
      setError(null)
      setBypassNotice(null)
      const result = await addBypassAccountAction({
        orgSlug: org.githubOrgSlug,
        bypassKind: "app_bot",
        actorSlug: suggestionToAdd.actorSlug,
        githubUsername: suggestionToAdd.githubUsername,
      })

      if (!result.ok) {
        setError(result.error ?? "Failed to add bypass app/bot")
        return
      }

      setAppBotBypassQuery("")
      setSelectedAppBotBypassSuggestion(null)
      setAppBotBypassSuggestions([])
      setHighlightedAppBotBypassSuggestionIndex(-1)
      setAppBotBypassSuggestError(null)
      setBypassNotice({
        tone: result.recheckScheduleError ? "warning" : "success",
        message: result.recheckScheduleError
          ? "Bypass app/bot added, but open PR recheck scheduling failed."
          : "Bypass app/bot added. Open PR checks/comments are updating in the background.",
      })
      router.refresh()
    })
  }

  function handleUserBypassQueryKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (userBypassSuggestions.length === 0) return
      event.preventDefault()
      const nextIndex =
        highlightedUserBypassSuggestionIndex < 0
          ? 0
          : Math.min(highlightedUserBypassSuggestionIndex + 1, userBypassSuggestions.length - 1)
      setHighlightedUserBypassSuggestionIndex(nextIndex)
      setSelectedUserBypassSuggestion(userBypassSuggestions[nextIndex] ?? null)
      return
    }

    if (event.key === "ArrowUp") {
      if (userBypassSuggestions.length === 0) return
      event.preventDefault()
      const nextIndex =
        highlightedUserBypassSuggestionIndex <= 0 ? 0 : highlightedUserBypassSuggestionIndex - 1
      setHighlightedUserBypassSuggestionIndex(nextIndex)
      setSelectedUserBypassSuggestion(userBypassSuggestions[nextIndex] ?? null)
      return
    }

    if (event.key !== "Enter") return
    if (isMutating) return

    const highlightedSuggestion =
      highlightedUserBypassSuggestionIndex >= 0
        ? (userBypassSuggestions[highlightedUserBypassSuggestionIndex] ?? null)
        : null

    const suggestionToAdd = highlightedSuggestion ?? selectedUserBypassSuggestion
    if (!suggestionToAdd) return

    event.preventDefault()
    handleAddUserBypassAccount(suggestionToAdd)
  }

  function handleAppBotBypassQueryKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (appBotBypassSuggestions.length === 0) return
      event.preventDefault()
      const nextIndex =
        highlightedAppBotBypassSuggestionIndex < 0
          ? 0
          : Math.min(highlightedAppBotBypassSuggestionIndex + 1, appBotBypassSuggestions.length - 1)
      setHighlightedAppBotBypassSuggestionIndex(nextIndex)
      setSelectedAppBotBypassSuggestion(appBotBypassSuggestions[nextIndex] ?? null)
      return
    }

    if (event.key === "ArrowUp") {
      if (appBotBypassSuggestions.length === 0) return
      event.preventDefault()
      const nextIndex =
        highlightedAppBotBypassSuggestionIndex <= 0 ? 0 : highlightedAppBotBypassSuggestionIndex - 1
      setHighlightedAppBotBypassSuggestionIndex(nextIndex)
      setSelectedAppBotBypassSuggestion(appBotBypassSuggestions[nextIndex] ?? null)
      return
    }

    if (event.key !== "Enter") return
    if (isMutating) return

    const highlightedSuggestion =
      highlightedAppBotBypassSuggestionIndex >= 0
        ? (appBotBypassSuggestions[highlightedAppBotBypassSuggestionIndex] ?? null)
        : null

    const suggestionToAdd = highlightedSuggestion ?? selectedAppBotBypassSuggestion
    if (!suggestionToAdd) return

    event.preventDefault()
    handleAddAppBotBypassAccount(suggestionToAdd)
  }

  function handleRemoveBypassAccount(account: BypassAccount) {
    startRemoveBypassTransition(async () => {
      setError(null)
      setBypassNotice(null)
      const result = await removeBypassAccountAction({
        orgSlug: org.githubOrgSlug,
        bypassAccountId: account.id,
      })

      if (!result.ok) {
        setError(result.error ?? "Failed to remove bypass account")
        return
      }

      setBypassNotice({
        tone: result.recheckScheduleError ? "warning" : "success",
        message: result.recheckScheduleError
          ? "Bypass account removed, but open PR recheck scheduling failed."
          : "Bypass account removed. Open PR checks/comments are updating in the background.",
      })
      router.refresh()
    })
  }

  function handleDownloadCurrentCla() {
    if (!currentClaMarkdown.trim()) return
    const version = currentClaSha256 ? currentClaSha256.slice(0, 7) : "current"
    const fileName = `${sanitizeFilePart(org.githubOrgSlug)}-cla-${version}.md`
    downloadMarkdownFile(fileName, currentClaMarkdown)
  }

  function handleDownloadArchive(archive: ClaArchive) {
    const fileName = `${sanitizeFilePart(org.githubOrgSlug)}-cla-${archive.sha256.slice(0, 7)}-${archive.createdAt.slice(0, 10)}.md`
    downloadMarkdownFile(fileName, archive.claText)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
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
            disabled={isMutating}
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
          onClick={() => handleTabChange("cla")}
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
          onClick={() => handleTabChange("signers")}
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
          onClick={() => handleTabChange("archives")}
        >
          <History className="h-4 w-4" />
          Archives ({archives.length})
        </button>
        <button
          type="button"
          data-testid="tab-bypass"
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "bypass"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => handleTabChange("bypass")}
        >
          <UserPlus className="h-4 w-4" />
          Bypass ({bypassAccounts.length})
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
                {isEditing ? " Preview updates live as you type." : ""}
              </CardDescription>
            </div>
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
                data-testid="edit-cla-btn"
                onClick={() => {
                  setIsEditing(true)
                  setClaEditViewMode("split")
                }}
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
                    setClaEditViewMode("split")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  data-testid="save-cla-btn"
                  onClick={handleSave}
                  disabled={isMutating}
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary p-1">
                  <button
                    type="button"
                    data-testid="cla-view-edit"
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      effectiveClaEditViewMode === "edit"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setClaEditViewMode("edit")}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    data-testid="cla-view-split"
                    className={`hidden rounded-md px-3 py-1.5 text-sm font-medium transition-colors md:inline-flex ${
                      effectiveClaEditViewMode === "split"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setClaEditViewMode("split")}
                  >
                    Split
                  </button>
                  <button
                    type="button"
                    data-testid="cla-view-preview"
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      effectiveClaEditViewMode === "preview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setClaEditViewMode("preview")}
                  >
                    Preview
                  </button>
                </div>

                {effectiveClaEditViewMode === "split" ? (
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-5">
                    <textarea
                      value={claContent}
                      onChange={(event) => setClaContent(event.target.value)}
                      data-testid="cla-editor"
                      className="min-h-[400px] w-full rounded-lg border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Paste your CLA in Markdown format..."
                    />
                    <div
                      className="min-h-[400px] rounded-lg border bg-background p-6"
                      data-testid="cla-preview-live"
                    >
                      {claContent.trim().length > 0 ? (
                        <MarkdownRenderer content={claContent} />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Start typing your CLA markdown to preview it.
                        </p>
                      )}
                    </div>
                  </div>
                ) : effectiveClaEditViewMode === "edit" ? (
                  <textarea
                    value={claContent}
                    onChange={(event) => setClaContent(event.target.value)}
                    data-testid="cla-editor"
                    className="min-h-[400px] w-full rounded-lg border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Paste your CLA in Markdown format..."
                  />
                ) : (
                  <div
                    className="min-h-[400px] rounded-lg border bg-background p-6"
                    data-testid="cla-preview-live"
                  >
                    {claContent.trim().length > 0 ? (
                      <MarkdownRenderer content={claContent} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Start typing your CLA markdown to preview it.
                      </p>
                    )}
                  </div>
                )}
              </div>
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
            <CardDescription>
              Contributors grouped by their latest signature status for {org.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {signers.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No one has signed the CLA yet.</p>
              </div>
            ) : (
              <div className="space-y-7" data-testid="signers-list">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Current Version</h3>
                    <Badge className="border-primary/30 bg-primary/10 text-primary">
                      {currentVersionSigners.length}
                    </Badge>
                  </div>

                  {currentVersionSigners.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                      No contributors have signed the latest CLA yet.
                    </div>
                  ) : (
                    <div className="space-y-1 rounded-lg border">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 border-b px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <span>Contributor</span>
                        <span>Signed At</span>
                        <span className="justify-self-end">Version</span>
                      </div>
                      {currentVersionSigners.map((signature) => (
                        <div
                          key={signature.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 rounded-lg px-5 py-3.5 transition-colors hover:bg-secondary"
                          data-testid="signer-row"
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            <Image
                              src={signature.avatarUrl || "/placeholder.svg"}
                              alt={signature.name}
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-full"
                              sizes="32px"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {signature.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                @{signature.githubUsername}
                              </p>
                            </div>
                          </div>
                          <div className="whitespace-nowrap text-sm text-muted-foreground">
                            {new Date(signature.signedAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="justify-self-end">
                            <Badge
                              variant="outline"
                              className="border-primary/30 font-mono text-primary"
                            >
                              {signature.claSha256.slice(0, 7)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Outdated Versions</h3>
                    <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                      {outdatedSigners.length}
                    </Badge>
                  </div>

                  {outdatedSigners.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                      No contributors are currently outdated.
                    </div>
                  ) : (
                    <div className="space-y-1 rounded-lg border">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 border-b px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <span>Contributor</span>
                        <span>Signed At</span>
                        <span className="justify-self-end">Version</span>
                      </div>

                      {outdatedSigners.map((signature) => (
                        <div
                          key={signature.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 rounded-lg px-5 py-3.5 transition-colors hover:bg-secondary"
                          data-testid="signer-row"
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            <Image
                              src={signature.avatarUrl || "/placeholder.svg"}
                              alt={signature.name}
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-full"
                              sizes="32px"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {signature.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                @{signature.githubUsername}
                              </p>
                            </div>
                          </div>
                          <div className="whitespace-nowrap text-sm text-muted-foreground">
                            {new Date(signature.signedAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="justify-self-end">
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 font-mono text-amber-500"
                            >
                              {signature.claSha256.slice(0, 7)} (outdated)
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {Boolean(currentClaSha256) && outdatedSigners.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-500">
                {outdatedSigners.length} signer{outdatedSigners.length > 1 ? "s are" : " is"} on an
                older version and will need to re-sign.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "archives" && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">CLA Archives</CardTitle>
              <CardDescription>
                Snapshots of CLA text at the moment someone signed. Only versions that were actually
                signed appear here.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              onClick={handleDownloadCurrentCla}
              disabled={currentClaMarkdown.trim().length === 0}
            >
              <Download className="h-4 w-4" />
              Download Current CLA
            </Button>
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
                  const archiveSignerCount = archiveSignerCounts[archive.sha256] ?? 0

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
                            {archiveSignerCount} signer{archiveSignerCount !== 1 ? "s" : ""}
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 bg-transparent px-2 text-xs"
                            onClick={() => handleDownloadArchive(archive)}
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </Button>
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

      {activeTab === "bypass" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bypass Rules</CardTitle>
            <CardDescription>
              Accounts and automation actors on these lists bypass CLA enforcement for this org.
              Their PR CLA check is marked as passed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {bypassNotice && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  bypassNotice.tone === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                    : "border-primary/30 bg-primary/10 text-primary"
                }`}
              >
                {bypassNotice.message}
              </div>
            )}

            <div className="rounded-lg border bg-secondary/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Bypass Users</h3>
                <Badge variant="outline">{userBypassAccounts.length}</Badge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="bypass-user-query"
                    value={userBypassQuery}
                    onChange={(event) => {
                      setUserBypassQuery(event.target.value)
                      setSelectedUserBypassSuggestion(null)
                      setHighlightedUserBypassSuggestionIndex(-1)
                      setBypassNotice(null)
                    }}
                    onKeyDown={handleUserBypassQueryKeyDown}
                    placeholder="Search GitHub username..."
                    className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />

                  {(isSearchingUserBypass ||
                    userBypassSuggestions.length > 0 ||
                    userBypassSuggestError ||
                    userBypassQuery.trim().replace(/^@/, "").length >= 2) && (
                    <div className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                      {isSearchingUserBypass ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
                      ) : userBypassSuggestError ? (
                        <div className="px-3 py-2 text-sm text-destructive">
                          {userBypassSuggestError}
                        </div>
                      ) : userBypassSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No GitHub users found.
                        </div>
                      ) : (
                        <ul>
                          {userBypassSuggestions.map((suggestion, index) => (
                            <li key={suggestion.githubUserId}>
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                                  index === highlightedUserBypassSuggestionIndex
                                    ? "bg-secondary"
                                    : ""
                                }`}
                                onMouseEnter={() => setHighlightedUserBypassSuggestionIndex(index)}
                                onClick={() => {
                                  setSelectedUserBypassSuggestion(suggestion)
                                  setUserBypassQuery(suggestion.githubUsername)
                                  setUserBypassSuggestions([])
                                  setHighlightedUserBypassSuggestionIndex(-1)
                                }}
                              >
                                <span className="min-w-0 flex items-center gap-2">
                                  <Image
                                    src={suggestion.avatarUrl || "/placeholder.svg"}
                                    alt={suggestion.githubUsername}
                                    width={20}
                                    height={20}
                                    className="h-5 w-5 rounded-full"
                                    sizes="20px"
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-foreground">
                                      @{suggestion.githubUsername}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                      {suggestion.type}
                                    </span>
                                  </span>
                                </span>
                                {suggestion.alreadyBypassed && (
                                  <Badge variant="outline" className="text-xs">
                                    Already bypassed
                                  </Badge>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => handleAddUserBypassAccount()}
                  disabled={!selectedUserBypassSuggestion || isMutating}
                >
                  {isAddingBypass ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            </div>

            {userBypassAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No user bypass accounts configured.
              </div>
            ) : (
              <div className="space-y-1 rounded-lg border">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Account</span>
                  <span>Added</span>
                  <span className="justify-self-end">Action</span>
                </div>
                {userBypassAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        @{account.githubUsername}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        ID {account.githubUserId}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(account.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="justify-self-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 bg-transparent px-2 text-xs"
                        onClick={() => handleRemoveBypassAccount(account)}
                        disabled={isMutating}
                      >
                        {isRemovingBypass ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border bg-secondary/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Bypass GitHub Apps & Bots</h3>
                <Badge variant="outline">{appBotBypassAccounts.length}</Badge>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Add app/system bot slugs like <code>dependabot</code> or{" "}
                <code>github-actions[bot]</code>. Matching applies to both slug and{" "}
                <code>{`<slug>[bot]`}</code>.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="bypass-app-bot-query"
                    value={appBotBypassQuery}
                    onChange={(event) => {
                      setAppBotBypassQuery(event.target.value)
                      setSelectedAppBotBypassSuggestion(null)
                      setHighlightedAppBotBypassSuggestionIndex(-1)
                      setBypassNotice(null)
                    }}
                    onKeyDown={handleAppBotBypassQueryKeyDown}
                    placeholder="Search or type app/bot slug..."
                    className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />

                  {(isSearchingAppBotBypass ||
                    appBotBypassSuggestions.length > 0 ||
                    appBotBypassSuggestError ||
                    appBotBypassQuery.trim().replace(/^@/, "").length >= 2) && (
                    <div className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                      {isSearchingAppBotBypass ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
                      ) : appBotBypassSuggestError ? (
                        <div className="px-3 py-2 text-sm text-destructive">
                          {appBotBypassSuggestError}
                        </div>
                      ) : appBotBypassSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          No app/bot matches found.
                        </div>
                      ) : (
                        <ul>
                          {appBotBypassSuggestions.map((suggestion, index) => (
                            <li key={suggestion.actorSlug}>
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                                  index === highlightedAppBotBypassSuggestionIndex
                                    ? "bg-secondary"
                                    : ""
                                }`}
                                onMouseEnter={() =>
                                  setHighlightedAppBotBypassSuggestionIndex(index)
                                }
                                onClick={() => {
                                  setSelectedAppBotBypassSuggestion(suggestion)
                                  setAppBotBypassQuery(suggestion.githubUsername)
                                  setAppBotBypassSuggestions([])
                                  setHighlightedAppBotBypassSuggestionIndex(-1)
                                }}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-foreground">
                                    @{suggestion.githubUsername}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    slug: {suggestion.actorSlug}
                                  </span>
                                </span>
                                <div className="flex items-center gap-2">
                                  {suggestion.source === "manual" && (
                                    <Badge variant="outline" className="text-xs">
                                      Manual
                                    </Badge>
                                  )}
                                  {suggestion.alreadyBypassed && (
                                    <Badge variant="outline" className="text-xs">
                                      Already bypassed
                                    </Badge>
                                  )}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => handleAddAppBotBypassAccount()}
                  disabled={!selectedAppBotBypassSuggestion || isMutating}
                >
                  {isAddingBypass ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            </div>

            {appBotBypassAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No app/bot bypass accounts configured.
              </div>
            ) : (
              <div className="space-y-1 rounded-lg border">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span>App / Bot</span>
                  <span>Added</span>
                  <span className="justify-self-end">Action</span>
                </div>
                {appBotBypassAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        @{account.githubUsername}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        slug {account.actorSlug ?? "unknown"}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(account.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="justify-self-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 bg-transparent px-2 text-xs"
                        onClick={() => handleRemoveBypassAccount(account)}
                        disabled={isMutating}
                      >
                        {isRemovingBypass ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Limit: 50 total bypass entries per organization (users + apps/bots).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function downloadMarkdownFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function sanitizeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
}
