import type { Metadata } from "next"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Github, ArrowRight, Check, X, Minus, ExternalLink } from "lucide-react"

export const metadata: Metadata = {
  title: "CLA Bot vs CLA Assistant vs EasyCLA — Feature Comparison",
  description:
    "Compare CLA Bot by fiveonefour with CLA Assistant, EasyCLA, and other CLA tools. See which solution fits your GitHub organization best.",
  keywords: [
    "CLA Bot comparison",
    "CLA Assistant alternative",
    "EasyCLA alternative",
    "CLA tool comparison",
    "Contributor License Agreement tools",
    "GitHub CLA",
  ],
  alternates: {
    canonical: "https://cla.fiveonefour.com/compare",
  },
}

type FeatureStatus = "yes" | "no" | "partial"

type Feature = {
  name: string
  description?: string
  claBot: FeatureStatus
  claAssistant: FeatureStatus
  easyCla: FeatureStatus
  claBotFinos: FeatureStatus
}

const FEATURE_CATEGORIES: Array<{
  category: string
  features: Feature[]
}> = [
  {
    category: "Setup & Hosting",
    features: [
      {
        name: "Free hosted version",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "no",
        claBotFinos: "no",
      },
      {
        name: "Self-hostable",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "no",
        claBotFinos: "yes",
      },
      {
        name: "Open source",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "partial",
        claBotFinos: "yes",
        description:
          "EasyCLA has open source components but requires Linux Foundation infrastructure",
      },
      {
        name: "GitHub App (no token sharing)",
        claBot: "yes",
        claAssistant: "partial",
        easyCla: "yes",
        claBotFinos: "yes",
        description: "CLA Assistant requests broad OAuth scopes",
      },
      {
        name: "No external dependencies",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "yes",
        description:
          "CLA Assistant stores CLAs as GitHub Gists; EasyCLA requires LF infrastructure",
      },
    ],
  },
  {
    category: "CLA Management",
    features: [
      {
        name: "Markdown CLA editor with preview",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "partial",
        claBotFinos: "no",
        description: "CLA Assistant uses GitHub Gists for CLA text",
      },
      {
        name: "CLA version tracking (SHA-256)",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "partial",
        claBotFinos: "no",
        description:
          "CLA Bot hashes every CLA version; changes always produce a new trackable version",
      },
      {
        name: "Automatic re-sign on CLA update",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "partial",
        claBotFinos: "no",
        description:
          "CLA Bot detects outdated signatures and prompts re-signing across all open PRs",
      },
      {
        name: "Downloadable CLA records",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "yes",
        claBotFinos: "no",
        description: "Both admins and contributors can download signed CLA versions",
      },
    ],
  },
  {
    category: "PR Enforcement",
    features: [
      {
        name: "Automatic PR check runs",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "yes",
        claBotFinos: "yes",
      },
      {
        name: "PR comment with signing link",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "yes",
        claBotFinos: "yes",
      },
      {
        name: "Auto-remove comments after signing",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "no",
        description: "CLA Bot cleans up its own PR comments once the contributor signs",
      },
      {
        name: "Merge queue support",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "no",
        description: "Auto-passes checks on merge queue commits without re-verification",
      },
      {
        name: "/recheck command",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "no",
        claBotFinos: "no",
        description: "Re-trigger CLA checks via PR comment with authorization controls",
      },
      {
        name: "Async PR convergence on changes",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "no",
        description: "CLA or bypass changes automatically propagate to all open PRs",
      },
    ],
  },
  {
    category: "Bypass & Automation",
    features: [
      {
        name: "Bot bypass lists",
        claBot: "yes",
        claAssistant: "partial",
        easyCla: "partial",
        claBotFinos: "partial",
        description: "CLA Bot normalizes bot slugs (mybot = mybot[bot]) automatically",
      },
      {
        name: "GitHub App bypass",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "no",
        description: "Exempt specific GitHub Apps from CLA checks",
      },
      {
        name: "Per-org bypass scoping",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "yes",
        claBotFinos: "no",
      },
      {
        name: "Org member auto-bypass",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "yes",
        claBotFinos: "no",
        description: "Organization members are automatically exempt from signing",
      },
    ],
  },
  {
    category: "Security & Compliance",
    features: [
      {
        name: "Append-only audit trail",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "yes",
        claBotFinos: "no",
        description: "No delete endpoints exist for signature data",
      },
      {
        name: "IP hash recording (HMAC-SHA256)",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "no",
        description: "Request IP is hashed at signing time for audit without storing raw IPs",
      },
      {
        name: "Immutable identity binding (GitHub user ID)",
        claBot: "yes",
        claAssistant: "partial",
        easyCla: "yes",
        claBotFinos: "no",
        description: "Signatures keyed by immutable GitHub user ID, not username",
      },
      {
        name: "Email provenance tracking",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "partial",
        claBotFinos: "no",
        description: "Captures verified email status at the moment of signing",
      },
      {
        name: "Stateless JWT sessions",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "no",
        claBotFinos: "no",
        description: "No session storage needed — works in distributed deployments",
      },
    ],
  },
  {
    category: "Contributor Experience",
    features: [
      {
        name: "GitHub OAuth (no extra accounts)",
        claBot: "yes",
        claAssistant: "yes",
        easyCla: "partial",
        claBotFinos: "no",
        description: "EasyCLA requires LF account creation for some flows",
      },
      {
        name: "Contributor dashboard",
        claBot: "yes",
        claAssistant: "no",
        easyCla: "yes",
        claBotFinos: "no",
        description: "Contributors can view and track all their signed CLAs",
      },
      {
        name: "Corporate CLA support",
        claBot: "no",
        claAssistant: "no",
        easyCla: "yes",
        claBotFinos: "no",
        description: "EasyCLA supports both individual and corporate contributor agreements",
      },
    ],
  },
]

function StatusIcon({ status }: { status: FeatureStatus }) {
  switch (status) {
    case "yes":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        </span>
      )
    case "no":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
          <X className="h-3.5 w-3.5 text-red-400" />
        </span>
      )
    case "partial":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15">
          <Minus className="h-3.5 w-3.5 text-amber-400" />
        </span>
      )
  }
}

const SOLUTIONS = [
  {
    name: "CLA Bot",
    subtitle: "by fiveonefour",
    highlight: true,
  },
  {
    name: "CLA Assistant",
    subtitle: "by SAP",
    highlight: false,
  },
  {
    name: "EasyCLA",
    subtitle: "by Linux Foundation",
    highlight: false,
  },
  {
    name: "cla-bot",
    subtitle: "by FINOS",
    highlight: false,
  },
]

function getStatusForSolution(feature: Feature, index: number): FeatureStatus {
  switch (index) {
    case 0:
      return feature.claBot
    case 1:
      return feature.claAssistant
    case 2:
      return feature.easyCla
    case 3:
      return feature.claBotFinos
    default:
      return "no"
  }
}

export default function ComparePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 pb-16 pt-20 sm:pt-24">
          <div className="mx-auto max-w-5xl">
            <h1 className="font-display text-balance text-4xl leading-[0.95] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              How CLA Bot compares
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Not all CLA tools are equal. Compare CLA Bot by fiveonefour with CLA Assistant,
              EasyCLA, and other solutions across the features that matter.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/auth/signin">
                <Button size="lg" className="group gap-2 text-base">
                  <Github className="h-5 w-5" />
                  Get started free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 border-white/20 bg-transparent text-base"
                >
                  Read the docs
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Legend */}
        <section className="border-t border-white/10 px-4 py-6">
          <div className="mx-auto flex max-w-5xl flex-wrap gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <StatusIcon status="yes" />
              Fully supported
            </span>
            <span className="flex items-center gap-2">
              <StatusIcon status="partial" />
              Partial / limited
            </span>
            <span className="flex items-center gap-2">
              <StatusIcon status="no" />
              Not supported
            </span>
          </div>
        </section>

        {/* Feature matrix */}
        <section className="px-4 pb-20">
          <div className="mx-auto max-w-5xl space-y-8">
            {FEATURE_CATEGORIES.map((cat) => (
              <Card key={cat.category} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Category header */}
                  <div className="border-b border-white/10 bg-card/80 px-6 py-4">
                    <h2 className="font-display text-lg font-semibold text-foreground">
                      {cat.category}
                    </h2>
                  </div>

                  {/* Column headers */}
                  <div className="hidden border-b border-white/10 bg-card/40 sm:grid sm:grid-cols-[1fr_repeat(4,100px)] sm:gap-0">
                    <div className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Feature
                    </div>
                    {SOLUTIONS.map((sol) => (
                      <div
                        key={sol.name}
                        className={`flex flex-col items-center justify-center px-2 py-3 text-center ${
                          sol.highlight ? "bg-primary/5" : ""
                        }`}
                      >
                        <span
                          className={`text-xs font-semibold ${
                            sol.highlight ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {sol.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{sol.subtitle}</span>
                      </div>
                    ))}
                  </div>

                  {/* Feature rows */}
                  {cat.features.map((feature, featureIdx) => (
                    <div
                      key={feature.name}
                      className={`border-b border-white/5 last:border-0 ${
                        featureIdx % 2 === 0 ? "bg-card/20" : "bg-card/40"
                      }`}
                    >
                      {/* Desktop row */}
                      <div className="hidden sm:grid sm:grid-cols-[1fr_repeat(4,100px)] sm:items-center sm:gap-0">
                        <div className="px-6 py-4">
                          <p className="text-sm font-medium text-foreground">{feature.name}</p>
                          {feature.description && (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
                              {feature.description}
                            </p>
                          )}
                        </div>
                        {SOLUTIONS.map((sol, solIdx) => (
                          <div
                            key={sol.name}
                            className={`flex items-center justify-center py-4 ${
                              sol.highlight ? "bg-primary/5" : ""
                            }`}
                          >
                            <StatusIcon status={getStatusForSolution(feature, solIdx)} />
                          </div>
                        ))}
                      </div>

                      {/* Mobile row */}
                      <div className="space-y-3 px-6 py-4 sm:hidden">
                        <div>
                          <p className="text-sm font-medium text-foreground">{feature.name}</p>
                          {feature.description && (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
                              {feature.description}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {SOLUTIONS.map((sol, solIdx) => (
                            <div
                              key={sol.name}
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                                sol.highlight ? "bg-primary/10" : "bg-white/5"
                              }`}
                            >
                              <StatusIcon status={getStatusForSolution(feature, solIdx)} />
                              <span className="text-xs text-muted-foreground">{sol.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Summary cards */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">
              When to choose what
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Every tool has its sweet spot. Here is an honest take.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-6">
                  <h3 className="font-display text-xl text-foreground">CLA Bot by fiveonefour</h3>
                  <p className="mt-1 text-xs text-primary">Best for most teams</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Best when you want a modern, maintained CLA tool that handles edge cases like
                    merge queues, CLA version changes, and bot bypass out of the box. Free hosted at{" "}
                    <span className="text-foreground">cla.fiveonefour.com</span> or self-host on
                    your infrastructure.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display text-xl text-foreground">CLA Assistant</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Good for simple setups</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    A reasonable choice if you have a single-version CLA that rarely changes and
                    don&apos;t need audit trails, bot bypass, or merge queue support. Be aware of
                    occasional stability issues with the hosted service.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display text-xl text-foreground">EasyCLA</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Enterprise / Linux Foundation projects
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    The right pick if you need corporate CLA support with company-level signing
                    workflows. Requires Linux Foundation infrastructure and is heavier to set up,
                    but covers corporate contributor scenarios no other tool does.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display text-xl text-foreground">cla-bot (FINOS)</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimal / config-file approach
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Works if you want a lightweight bot that reads a{" "}
                    <code className="rounded bg-white/10 px-1 py-0.5 text-xs">.clabot</code> config
                    file and you manage your contributor list manually. No signing UI, no version
                    tracking, no audit trail.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Correction notice */}
        <section className="border-t border-white/10 px-4 py-10">
          <div className="mx-auto max-w-5xl">
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              We strive to keep this comparison accurate and fair. If you spot a mistake or
              something has changed,{" "}
              <a
                href="https://github.com/514-labs/cla-bot/issues/new?title=Comparison+page+correction&labels=documentation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                open an issue
              </a>{" "}
              or{" "}
              <a
                href="https://github.com/514-labs/cla-bot/edit/main/app/compare/page.tsx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                submit a PR
              </a>{" "}
              to correct it.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">
              Ready to automate your CLAs?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Install in minutes. Free and open source. Built with care by{" "}
              <a
                href="https://fiveonefour.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                fiveonefour
              </a>
              .
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auth/signin">
                <Button size="lg" className="group gap-2 text-base">
                  <Github className="h-5 w-5" />
                  Install GitHub App
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <a
                href="https://github.com/514-labs/cla-bot"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 border-white/20 bg-transparent text-base"
                >
                  <Github className="h-5 w-5" />
                  View source
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
