"use client"

import React, { useCallback, useMemo, useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  FileCheck2,
  Github,
  Loader2,
  ScrollText,
} from "lucide-react"
import { signClaAction } from "@/app/sign/[orgSlug]/actions"

type SignPageOrg = {
  name: string
  githubOrgSlug: string
  claMarkdown: string
  isActive: boolean
}

type SignPageUser = {
  name: string
  githubUsername: string
  avatarUrl: string
}

type ExistingSignature = {
  signedAt: string
}

type SignClaClientProps = {
  org: SignPageOrg
  user: SignPageUser
  orgSlug: string
  repoName: string | null
  prNumber: string | null
  alreadySigned: boolean
  needsResign: boolean
  existingSignature: ExistingSignature | null
  currentSha256: string | null
  signedSha256: string | null
}

export function SignClaClient({
  org,
  user,
  orgSlug,
  repoName,
  prNumber,
  alreadySigned,
  needsResign,
  existingSignature,
  currentSha256,
  signedSha256,
}: SignClaClientProps) {
  const router = useRouter()
  const [justSigned, setJustSigned] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [postSignNotice, setPostSignNotice] = useState<{
    tone: "info" | "warning"
    message: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  const hasConfiguredCla = Boolean(currentSha256 && org.claMarkdown.trim().length > 0)
  const signed = alreadySigned || justSigned
  const showSignAction = !signed && hasConfiguredCla

  const signedBannerText = useMemo(() => {
    if (existingSignature && !justSigned) {
      return `Signed on ${new Date(existingSignature.signedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`
    }
    return "Signed just now"
  }, [existingSignature, justSigned])

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40
    if (isAtBottom) {
      setScrolledToBottom(true)
    }
  }, [])

  function handleSign() {
    if (!currentSha256 || !hasConfiguredCla) return

    startTransition(async () => {
      setActionError(null)
      setPostSignNotice(null)
      const result = await signClaAction({
        orgSlug,
        repoName,
        prNumber,
        acceptedSha256: currentSha256,
      })

      if (!result.ok) {
        setActionError(result.error ?? "Unable to sign right now")
        return
      }

      if (result.prSyncScheduled) {
        setPostSignNotice({
          tone: "info",
          message: "Signed. Open PR checks will update automatically in the background.",
        })
      } else if (result.prSyncScheduleError) {
        setPostSignNotice({
          tone: "warning",
          message:
            "Signed, but background PR sync could not be scheduled. Use /recheck on open PRs if needed.",
        })
      } else if (result.prSyncSkippedReason === "missing_installation_id") {
        setPostSignNotice({
          tone: "warning",
          message:
            "Signed. PR sync was skipped because this org has no active GitHub installation.",
        })
      }

      setJustSigned(true)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-secondary px-4 py-1.5 text-sm text-muted-foreground">
          <ScrollText className="h-4 w-4 text-primary" />
          Contributor License Agreement
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {org.name} CLA
        </h1>
        <p className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
          <Github className="h-4 w-4" />
          {org.githubOrgSlug}
          {currentSha256 && (
            <code className="text-xs text-muted-foreground">({currentSha256.slice(0, 7)})</code>
          )}
        </p>
      </div>

      {!org.isActive && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-muted-foreground/30 bg-secondary px-5 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">CLA Bot is inactive</p>
            <p className="text-xs text-muted-foreground">
              The CLA bot has been deactivated for this organization. Signing is currently disabled.
            </p>
          </div>
        </div>
      )}

      {!hasConfiguredCla && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-foreground">CLA not configured yet</p>
            <p className="text-xs text-muted-foreground">
              A maintainer needs to publish this organization&apos;s CLA before contributors can
              sign.
            </p>
          </div>
        </div>
      )}

      {needsResign && !justSigned && (
        <div
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4"
          data-testid="resign-banner"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-foreground">Re-signing required</p>
            <p className="text-xs text-muted-foreground">
              The CLA has been updated since you last signed
              {signedSha256 ? ` (you signed version ${signedSha256.slice(0, 7)})` : ""}. Please
              review and sign the latest version
              {currentSha256 ? ` (${currentSha256.slice(0, 7)})` : ""}.
            </p>
          </div>
        </div>
      )}

      {signed && (
        <div
          className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4"
          data-testid="signed-banner"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">You have signed this CLA</p>
            <p className="text-xs text-muted-foreground">
              {signedBannerText}
              {user ? ` as @${user.githubUsername}` : ""}
              {currentSha256 ? ` (version ${currentSha256.slice(0, 7)})` : ""}
            </p>
          </div>
          <Badge className="ml-auto border-primary/30 bg-primary/10 text-primary">Signed</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-4 w-4 text-primary" />
            Agreement
            {currentSha256 && (
              <code className="text-xs font-normal text-muted-foreground">
                {currentSha256.slice(0, 7)}
              </code>
            )}
          </CardTitle>
          <CardDescription>
            {hasConfiguredCla
              ? "Please read the full agreement below."
              : "No CLA has been published for this organization yet."}
            {showSignAction && " Scroll to the bottom to enable signing."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasConfiguredCla ? (
            <div
              className="max-h-[500px] overflow-y-auto rounded-lg border bg-background p-6"
              onScroll={handleScroll}
              data-testid="cla-scroll-area"
            >
              <MarkdownRenderer content={org.claMarkdown} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-sm text-muted-foreground">
              This page will show the agreement once a maintainer adds it in the admin dashboard.
            </div>
          )}
        </CardContent>
      </Card>

      {showSignAction && org.isActive && (
        <Card className="mt-6">
          <CardContent className="py-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex items-center gap-3">
                <Image
                  src={user.avatarUrl || "/placeholder.svg"}
                  alt={user.name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full"
                  sizes="40px"
                />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {needsResign
                  ? "The agreement has been updated. By clicking below, you agree to the terms of the new version."
                  : "By clicking below, you acknowledge that you have read and agree to the terms of this Contributor License Agreement."}
              </p>

              <p className="text-xs text-muted-foreground">
                By signing, you agree to our{" "}
                <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Privacy Policy
                </Link>
                .
              </p>

              {actionError && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {actionError}
                </p>
              )}

              {postSignNotice && (
                <p
                  className={
                    postSignNotice.tone === "warning"
                      ? "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
                      : "rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary"
                  }
                >
                  {postSignNotice.message}
                </p>
              )}

              <Button
                size="lg"
                className="gap-2"
                disabled={!scrolledToBottom || isPending || !currentSha256}
                onClick={handleSign}
                data-testid="sign-btn"
              >
                {isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileCheck2 className="h-5 w-5" />
                )}
                {scrolledToBottom
                  ? needsResign
                    ? "Re-sign Agreement"
                    : "Sign Agreement"
                  : "Scroll to read full agreement"}
              </Button>

              {!scrolledToBottom && (
                <p className="text-xs text-muted-foreground" data-testid="scroll-hint">
                  Please scroll through the entire agreement to enable signing.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/contributor"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to My CLAs
        </Link>
      </div>
    </div>
  )
}
