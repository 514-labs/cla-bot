import Script from "next/script"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  FileCheck2,
  Github,
  ShieldCheck,
  Users,
  GitPullRequest,
  ArrowRight,
  RefreshCw,
  Bot,
  Hash,
  Lock,
  Terminal,
  Download,
  GitMerge,
  Server,
  Check,
  ExternalLink,
} from "lucide-react"
import { buildFiveonefourUrl } from "@/lib/marketing-links"

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CLA Bot",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  description:
    "Automate Contributor License Agreements for your GitHub organization. Install the GitHub App, upload your CLA in Markdown, and automatically check every pull request.",
  url: "https://cla.fiveonefour.com",
  author: {
    "@type": "Organization",
    name: "fiveonefour",
    url: buildFiveonefourUrl({
      medium: "app_jsonld",
      content: "software_application_author",
    }),
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
}

const WORKFLOW_FEATURES = [
  {
    icon: GitMerge,
    title: "Merge queue support",
    description:
      "Auto-passes checks on merge queue commits. Compliance is verified on the PR — queue entries are never blocked.",
  },
  {
    icon: Bot,
    title: "Bot and app bypass lists",
    description:
      "Exempt CI bots, GitHub Apps, and specific users per org. Slug matching treats mybot and mybot[bot] as equivalent.",
  },
  {
    icon: RefreshCw,
    title: "Automatic PR convergence",
    description:
      "Update CLA text, change bypass lists, or toggle enforcement — all open PRs recheck automatically via async workflows.",
  },
  {
    icon: Terminal,
    title: "/recheck command",
    description:
      "PR authors, org members, and maintainers re-trigger CLA checks with a comment. Unauthorized users are blocked.",
  },
]

const AUDIT_FEATURES = [
  {
    icon: Lock,
    title: "Append-only history",
    description:
      "Signatures cannot be deleted. Every record is preserved with timestamp, hash, and session evidence.",
  },
  {
    icon: Hash,
    title: "SHA-256 versioning",
    description:
      "Each CLA version is identified by its SHA-256 hash. Text changes produce a new hash and trigger re-signing.",
  },
  {
    icon: Users,
    title: "Immutable identity binding",
    description:
      "Signatures are keyed by GitHub user ID, not username. Renames never break compliance records.",
  },
  {
    icon: Download,
    title: "Downloadable by both parties",
    description:
      "Contributors download every CLA version they signed. Admins download current and archived versions.",
  },
]

const HOW_IT_WORKS = [
  {
    icon: Github,
    step: "01",
    title: "Install the GitHub App",
    description:
      "Sign in as an org admin, install CLA Bot, and select which repositories to monitor.",
  },
  {
    icon: FileCheck2,
    step: "02",
    title: "Publish your CLA",
    description: "Paste your agreement in Markdown. Every version is tracked by its SHA-256 hash.",
  },
  {
    icon: GitPullRequest,
    step: "03",
    title: "PRs are checked automatically",
    description: "Non-members get signing guidance. Checks update automatically after signature.",
  },
]

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <Script id="cla-bot-jsonld" type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </Script>

      <SiteHeader />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* ── Hero ── */}
        <section className="px-4 pb-24 pt-20 sm:pt-28">
          <div className="mx-auto max-w-4xl">
            <h1 className="font-display text-balance text-4xl leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              CLA automation
              <br />
              for GitHub orgs
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Install a GitHub App, upload your CLA in Markdown, and every pull request is checked
              automatically. Signatures are tracked by immutable GitHub ID and SHA-256 content hash.
              Self-hostable. MIT licensed.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link href="/auth/signin">
                <Button size="lg" className="group gap-2 text-base">
                  <Github className="h-5 w-5" />
                  Install GitHub App
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/sign/fiveonefour">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 border-white/20 bg-transparent text-base"
                >
                  See a live CLA page
                </Button>
              </Link>
            </div>

            {/* Quick facts strip */}
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
              {[
                "Free and open source",
                "Next.js + PostgreSQL",
                "No vendor lock-in",
                "Works with merge queues",
              ].map((fact) => (
                <span key={fact} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  {fact}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">
              Three steps to enforce
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Setup takes less time than writing the CLA itself.
            </p>

            <ol className="mt-12 space-y-0">
              {HOW_IT_WORKS.map((item, i) => (
                <li key={item.step} className="relative flex gap-6 pb-10 last:pb-0">
                  {/* vertical connector */}
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="absolute left-[21px] top-[44px] bottom-0 w-px bg-white/10" />
                  )}
                  <div className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-card/80">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="pt-1">
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Workflow features ── */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">
              Handles the edge cases
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Merge queues, bot accounts, policy changes, manual re-checks — covered.
            </p>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:grid-cols-2">
              {WORKFLOW_FEATURES.map((item) => (
                <article
                  key={item.title}
                  className="flex gap-4 bg-card/60 p-6 transition-colors hover:bg-card/80"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Audit features ── */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
              <div className="lg:sticky lg:top-24">
                <h2 className="font-display text-3xl text-foreground sm:text-4xl">
                  Auditable
                  <br />
                  by default
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Signatures are cryptographically versioned and immutably stored. Both admins and
                  contributors can download records.
                </p>
                <p className="mt-4 text-sm text-muted-foreground/70">
                  No delete endpoints exist for signature data. Records are append-only at the
                  database level.
                </p>
              </div>

              <div className="space-y-4">
                {AUDIT_FEATURES.map((item) => (
                  <article
                    key={item.title}
                    className="group flex gap-4 rounded-lg border border-white/10 bg-card/40 p-5 transition-colors hover:border-primary/20 hover:bg-card/60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Self-host + Open source ── */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-xl border border-white/10 bg-card/40 p-8 sm:p-10">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-2xl text-foreground sm:text-3xl">
                    Self-host it. Read every line.
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    MIT licensed. Deploy on your own infrastructure with full control over data
                    residency. The entire stack is Next.js, PostgreSQL, and Drizzle ORM.
                  </p>
                </div>
              </div>

              {/* Tech stack inline */}
              <div className="mt-8 flex flex-wrap gap-2">
                {["Next.js", "PostgreSQL", "Drizzle ORM", "GitHub App API", "Vercel-ready"].map(
                  (tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-white/10 bg-background/60 px-3 py-1.5 font-mono text-xs text-muted-foreground"
                    >
                      {tech}
                    </span>
                  )
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="https://github.com/514-labs/cla-bot"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-white/20 bg-transparent"
                  >
                    <Github className="h-4 w-4" />
                    View source
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Personas ── */}
        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-card/40 p-8">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display text-xl text-foreground">Org Admin</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Manage agreements, view signer history, toggle enforcement, and handle CLA version
                transitions.
              </p>
              <Link href="/admin" className="mt-5 inline-block">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  Open dashboard
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>

            <div className="rounded-xl border border-white/10 bg-card/40 p-8">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display text-xl text-foreground">Contributor</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Read, sign, and track agreement versions. Re-sign prompts appear automatically when
                a newer CLA is published.
              </p>
              <Link href="/contributor" className="mt-5 inline-block">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  View your CLAs
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
