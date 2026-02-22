"use client"

import React from "react"
import { useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { SiteHeader } from "@/components/site-header"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, AlertTriangle, Check, FileCheck2, Github, Loader2, ScrollText } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SignClaPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  const { data, isLoading, mutate } = useSWR(`/api/sign/${orgSlug}`, fetcher)

  const org = data?.org
  const user = data?.user
  const alreadySigned = data?.alreadySigned ?? false
  const needsResign = data?.needsResign ?? false
  const existingSignature = data?.signature
  const currentSha256: string | null = data?.currentSha256 ?? null
  const signedSha256: string | null = data?.signedSha256 ?? null

  const [justSigned, setJustSigned] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [signing, setSigning] = useState(false)

  const signed = alreadySigned || justSigned

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40
    if (isAtBottom) {
      setScrolledToBottom(true)
    }
  }, [])

  async function handleSign() {
    setSigning(true)
    const res = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug }),
    })
    if (res.ok) {
      setJustSigned(true)
      mutate()
    }
    setSigning(false)
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

  // Show the signing form when the user hasn't signed the current version
  const showSignAction = !signed

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          {/* Header */}
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
                <code className="text-xs text-muted-foreground">
                  ({currentSha256.slice(0, 7)})
                </code>
              )}
            </p>
          </div>

          {/* Inactive warning */}
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

          {/* Re-sign required banner */}
          {needsResign && !justSigned && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4" data-testid="resign-banner">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Re-signing required
                </p>
                <p className="text-xs text-muted-foreground">
                  The CLA has been updated since you last signed
                  {signedSha256 ? ` (you signed version ${signedSha256.slice(0, 7)})` : ""}.
                  Please review and sign the latest version
                  {currentSha256 ? ` (${currentSha256.slice(0, 7)})` : ""}.
                </p>
              </div>
            </div>
          )}

          {/* Already signed (current version) banner */}
          {signed && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4" data-testid="signed-banner">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  You have signed this CLA
                </p>
                <p className="text-xs text-muted-foreground">
                  {existingSignature && !justSigned
                    ? `Signed on ${new Date(existingSignature.signedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}`
                    : "Signed just now"}
                  {user ? ` as @${user.githubUsername}` : ""}
                  {currentSha256 ? ` (version ${currentSha256.slice(0, 7)})` : ""}
                </p>
              </div>
              <Badge className="ml-auto border-primary/30 bg-primary/10 text-primary">
                Signed
              </Badge>
            </div>
          )}

          {/* CLA Content */}
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
                Please read the full agreement below.
                {showSignAction && " Scroll to the bottom to enable signing."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="max-h-[500px] overflow-y-auto rounded-lg border bg-background p-6"
                onScroll={handleScroll}
                data-testid="cla-scroll-area"
              >
                <MarkdownRenderer content={org.claMarkdown} />
              </div>
            </CardContent>
          </Card>

          {/* Sign action */}
          {showSignAction && org.isActive && (
            <Card className="mt-6">
              <CardContent className="py-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  {user && (
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatarUrl || "/placeholder.svg"}
                        alt={user.name}
                        className="h-10 w-10 rounded-full"
                        crossOrigin="anonymous"
                      />
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {needsResign
                      ? "The agreement has been updated. By clicking below, you agree to the terms of the new version."
                      : "By clicking below, you acknowledge that you have read and agree to the terms of this Contributor License Agreement."}
                  </p>
                  <Button
                    size="lg"
                    className="gap-2"
                    disabled={!scrolledToBottom || signing}
                    onClick={handleSign}
                    data-testid="sign-btn"
                  >
                    {signing ? (
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

          {/* Back link */}
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
      </main>
    </div>
  )
}
