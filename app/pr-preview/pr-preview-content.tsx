"use client"

import React, { useState, useCallback } from "react"
import { SiteHeader } from "@/components/site-header"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  GitPullRequest,
  XCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react"

type Scenario = "orgMember" | "unsigned" | "signed" | "resign" | "inactive"
type CheckStatus = "pending" | "success" | "failure" | null

export default function PrPreviewContent() {
  const [scenario, setScenario] = useState<Scenario>("unsigned")
  const [running, setRunning] = useState(false)
  const [checkStatus, setCheckStatus] = useState<CheckStatus>(null)
  const [commentMarkdown, setCommentMarkdown] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [orgSlug] = useState("fiveonefour")
  const [repoName] = useState("analytics-sdk")
  const [prNumber] = useState(42)
  const [stepLog, setStepLog] = useState<string[]>([])

  const prAuthorForScenario =
    scenario === "orgMember"
      ? "orgadmin"
      : "contributor1"

  const addLog = useCallback((msg: string) => {
    setStepLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  async function reset() {
    await fetch("/api/reset", { method: "POST" })
    setCheckStatus(null)
    setCommentMarkdown(null)
    setSkipped(false)
    setStepLog([])
  }

  async function simulatePrOpened() {
    setRunning(true)
    await reset()
    addLog("Database reset")

    // Setup scenario
    if (scenario === "inactive") {
      addLog("Deactivating CLA bot for org...")
      await fetch("/api/orgs/fiveonefour", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })
      addLog("Org deactivated -- bot will not run")
    }

    if (scenario === "resign") {
      addLog("Admin updating CLA to v2 (invalidates contributor1's v1 signature)...")
      await fetch("/api/orgs/fiveonefour", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claMarkdown: "# Updated Contributor License Agreement v2\n\nNew terms and conditions apply. Please review and re-sign." }),
      })
      addLog("CLA updated to v2 -- contributor1's v1 signature is now outdated")
    }

    if (scenario === "signed") {
      addLog("contributor1 already has a valid v1 signature (matches current CLA version)")
    }

    if (scenario === "orgMember") {
      addLog("orgadmin is a member of fiveonefour -- CLA check will auto-pass")
    }

    if (scenario === "unsigned") {
      addLog("Clearing contributor1's CLA signatures to simulate a new contributor...")
      await fetch("/api/test/clear-signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug: "fiveonefour", githubUsername: "contributor1" }),
      })
      addLog("Signatures cleared -- contributor1 has never signed any CLA for this org")
    }

    // Simulate webhook
    addLog(`Sending pull_request webhook (opened) for PR #${prNumber} by ${prAuthorForScenario}...`)
    setCheckStatus("pending")

    const webhookPayload = {
      action: "opened",
      number: prNumber,
      pull_request: {
        user: { login: prAuthorForScenario },
        head: { sha: "abc123def456" },
      },
      repository: {
        name: repoName,
        owner: { login: orgSlug },
      },
    }

    await new Promise((r) => setTimeout(r, 800))

    const res = await fetch("/api/webhook/github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "pull_request",
      },
      body: JSON.stringify(webhookPayload),
    })

    const data = await res.json()
    addLog(`Webhook response: ${data.message}`)

    if (data.skipped) {
      setSkipped(true)
      setCheckStatus(null)
      setCommentMarkdown(null)
      addLog("Bot is inactive -- no check created, no comment posted")
    } else {
      setCheckStatus(data.check?.status ?? null)
      setCommentMarkdown(data.comment?.commentMarkdown ?? null)
      addLog(`Check status: ${data.check?.status ?? "none"}`)
      if (!data.comment) {
        addLog("No comment posted (not needed)")
      }
    }

    addLog("Simulation complete")
    setRunning(false)
  }

  async function simulateSignAndRecheck() {
    setRunning(true)

    // Step 1: Sign the CLA as contributor
    addLog("Switching to contributor role...")
    await fetch("/api/mock-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "contributor" }),
    })

    addLog("Signing the CLA...")
    const signRes = await fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug }),
    })

    if (signRes.ok) {
      const signData = await signRes.json()
      addLog("CLA signed successfully")

      if (signData.updatedChecks?.length > 0) {
        addLog(`Auto-updated ${signData.updatedChecks.length} check(s) to success`)
        setCheckStatus("success")
      }
    } else {
      const err = await signRes.json()
      addLog(`Sign failed: ${err.error}`)
    }

    // Step 2: Fetch the updated comment via /recheck
    addLog("Sending /recheck to update the PR comment...")
    const recheckRes = await fetch("/api/webhook/github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "issue_comment",
      },
      body: JSON.stringify({
        action: "created",
        comment: { body: "/recheck" },
        issue: { number: prNumber, user: { login: prAuthorForScenario } },
        repository: { name: repoName, owner: { login: orgSlug } },
      }),
    })

    const recheckData = await recheckRes.json()
    addLog(`Recheck response: ${recheckData.message}`)

    if (recheckData.check) {
      setCheckStatus(recheckData.check.status)
    }
    if (recheckData.comment) {
      setCommentMarkdown(recheckData.comment.commentMarkdown)
    }

    // Switch back to admin
    await fetch("/api/mock-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    })

    setRunning(false)
  }

  const checkIcon =
    checkStatus === "success" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    ) : checkStatus === "failure" ? (
      <XCircle className="h-5 w-5 text-red-500" />
    ) : checkStatus === "pending" ? (
      <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
    ) : null

  const checkLabel =
    checkStatus === "success"
      ? "All checks have passed"
      : checkStatus === "failure"
        ? "Some checks were not successful"
        : checkStatus === "pending"
          ? "Checks are running..."
          : "No checks yet"

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              PR Bot Preview
            </h1>
            <p className="mt-1 text-muted-foreground">
              Simulate what happens when a pull request is opened on a repo with CLA Bot installed.
            </p>
          </div>

          {/* Controls */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base">Simulation Controls</CardTitle>
              <CardDescription>
                Choose a scenario and run the simulation to see the bot behavior.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: "orgMember" as const, label: "Org Member" },
                    { id: "unsigned" as const, label: "New Contributor (unsigned)" },
                    { id: "resign" as const, label: "CLA Updated (re-sign)" },
                    { id: "signed" as const, label: "Already Signed (current)" },
                    { id: "inactive" as const, label: "Bot Deactivated" },
                  ]).map((s) => (
                    <Button
                      key={s.id}
                      variant={scenario === s.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setScenario(s.id)}
                      disabled={running}
                      className={scenario !== s.id ? "bg-transparent" : ""}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    onClick={simulatePrOpened}
                    disabled={running}
                  >
                    {running ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Simulate PR Opened
                  </Button>
                  {(scenario === "unsigned" || scenario === "resign") && checkStatus === "failure" && (
                    <Button
                      variant="outline"
                      className="gap-2 bg-transparent"
                      onClick={simulateSignAndRecheck}
                      disabled={running}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sign CLA + Update Check
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="gap-2 bg-transparent"
                    onClick={reset}
                    disabled={running}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-8 lg:grid-cols-5">
            {/* PR View */}
            <div className="lg:col-span-3">
              {/* Mock PR header */}
              <Card className="mb-4">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <GitPullRequest className="h-5 w-5 text-emerald-500" />
                    <div className="flex-1">
                      <span className="block text-sm font-semibold text-foreground">
                        feat: add new analytics dashboard component
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        #{prNumber} opened by{" "}
                        <span className="font-medium text-foreground">
                          {prAuthorForScenario}
                        </span>{" "}
                        into <Badge variant="outline" className="ml-1 text-xs">main</Badge>
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Skipped state (inactive) */}
              {skipped && (
                <Card className="mb-4 border-muted-foreground/20">
                  <CardContent className="flex items-center gap-3 py-4">
                    <ShieldOff className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <span className="block text-sm font-medium text-muted-foreground">
                        CLA Bot is inactive
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        No check created, no comment posted. The PR is not blocked.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Check Status */}
              {checkStatus && (
                <Card className={`mb-4 ${
                  checkStatus === "failure"
                    ? "border-red-500/30"
                    : checkStatus === "success"
                      ? "border-emerald-500/30"
                      : "border-amber-500/30"
                }`}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      {checkIcon}
                      <div className="flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {checkLabel}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {checkStatus === "failure" ? (
                            <>
                              1 failing check -- <span className="font-medium text-red-400">license/cla</span> -- CLA not signed
                            </>
                          ) : checkStatus === "success" ? (
                            <>
                              1 passing check -- <span className="font-medium text-emerald-400">license/cla</span>
                            </>
                          ) : (
                            "Waiting for checks to complete..."
                          )}
                        </span>
                      </div>
                      {checkStatus === "failure" && (
                        <Badge variant="outline" className="border-red-500/30 text-red-400">
                          Required
                        </Badge>
                      )}
                      {checkStatus === "success" && (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                          Passed
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bot Comment (only shown when there IS a comment) */}
              {commentMarkdown && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                        <span className="text-xs font-bold text-primary">
                          CLA
                        </span>
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-foreground">
                          cla-bot
                          <Badge variant="secondary" className="ml-2 text-xs">
                            bot
                          </Badge>
                        </span>
                        <p className="text-xs text-muted-foreground">
                          commented just now
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border bg-background p-5">
                      <MarkdownRenderer content={commentMarkdown} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Success with no comment -- org member or signed contributor */}
              {checkStatus === "success" && !commentMarkdown && !skipped && (
                <Card className="border-emerald-500/20">
                  <CardContent className="flex items-center gap-3 py-8">
                    <ShieldCheck className="h-6 w-6 text-emerald-500" />
                    <div>
                      <span className="block text-sm font-semibold text-foreground">
                        No comment needed
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {scenario === "orgMember"
                          ? "Org members bypass CLA checks entirely. Green check, no noise."
                          : "Contributor has a valid signature on the current CLA version. Green check, no noise."}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty state */}
              {!commentMarkdown && !checkStatus && !skipped && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                      <GitPullRequest className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold text-foreground">
                      No simulation running
                    </h3>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Choose a scenario above and click &quot;Simulate PR Opened&quot; to see what the bot does on a pull request.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Side panel */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Event Log</CardTitle>
                  <CardDescription>
                    Step-by-step log of the simulation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stepLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No events yet. Run a simulation to see the log.
                    </p>
                  ) : (
                    <div className="max-h-[500px] space-y-1 overflow-y-auto">
                      {stepLog.map((log, i) => (
                        <p key={i} className="font-mono text-xs text-muted-foreground">
                          {log}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">About this scenario</CardTitle>
                </CardHeader>
                <CardContent>
                  {scenario === "orgMember" && (
                    <p className="text-sm text-muted-foreground">
                      PR author (orgadmin) is a member of the fiveonefour org. CLA check auto-passes with no comment posted. Org members never need to sign.
                    </p>
                  )}
                  {scenario === "unsigned" && (
                    <p className="text-sm text-muted-foreground">
                      An external contributor (contributor1) opens a PR but has never signed the CLA. The check fails and the bot posts a comment explaining what&apos;s needed with a direct link to sign. After signing, the check auto-updates to green and the comment updates to confirm -- no need to push a commit or comment /recheck.
                    </p>
                  )}
                  {scenario === "signed" && (
                    <p className="text-sm text-muted-foreground">
                      contributor1 has already signed the current CLA version (v1). The check passes immediately and no comment is posted -- zero friction for returning contributors.
                    </p>
                  )}
                  {scenario === "resign" && (
                    <p className="text-sm text-muted-foreground">
                      The admin updated the CLA to v2 since contributor1 last signed (v1). The check fails and the bot tells the contributor they need to re-sign the updated agreement. After re-signing, the check auto-updates.
                    </p>
                  )}
                  {scenario === "inactive" && (
                    <p className="text-sm text-muted-foreground">
                      The CLA bot has been deactivated for this org. Nothing happens -- no check run is created and no comment is posted. The PR is completely unaffected.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
