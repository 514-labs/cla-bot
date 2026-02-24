import Script from "next/script"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { FileCheck2, Github, ShieldCheck, Users, GitPullRequest, ArrowRight } from "lucide-react"

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
    url: "https://fiveonefour.com",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
}

const HOW_IT_WORKS = [
  {
    icon: Github,
    step: "01",
    title: "Install the GitHub App",
    description:
      "Sign in as an org admin, install the CLA Bot on your GitHub organization, and select which repositories to monitor.",
  },
  {
    icon: FileCheck2,
    step: "02",
    title: "Publish your CLA",
    description:
      "Write or paste your agreement in Markdown. Every signer is tracked by immutable SHA-256 version.",
  },
  {
    icon: GitPullRequest,
    step: "03",
    title: "Enforce on pull requests",
    description:
      "When non-members open PRs, CLA Bot posts signing guidance and updates checks automatically after signing.",
  },
]

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <Script id="cla-bot-jsonld" type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </Script>

      <div className="pointer-events-none absolute inset-0 bg-app-radial" />
      <div className="pointer-events-none absolute inset-0 bg-grid-overlay opacity-25" />
      <div className="pointer-events-none absolute inset-0 bg-noise-texture opacity-40" />

      <SiteHeader />

      <main className="relative z-10 flex flex-1 flex-col">
        <section className="px-4 pb-20 pt-20 sm:pt-28">
          <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Legal Automation for Open Source
              </p>
              <h1 className="font-display text-balance text-4xl leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                Automate your Contributor License Agreements
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                Install the GitHub App, publish your CLA once, and keep every pull request compliant
                with a transparent, auditable signing workflow.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link href="/auth/signin">
                  <Button size="lg" className="group gap-2 text-base">
                    <Github className="h-5 w-5" />
                    Sign in with GitHub
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/sign/fiveonefour">
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2 border-white/20 bg-transparent text-base"
                  >
                    View example CLA
                  </Button>
                </Link>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/10 bg-card/70 p-6 backdrop-blur-xl">
              <h2 className="font-display text-xl text-foreground">Launch in minutes</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The same product supports maintainers and contributors without separate tools.
              </p>
              <div className="mt-6 space-y-4">
                {[
                  "Org members bypass checks automatically",
                  "Contributors sign once per organization",
                  "Updated CLA versions trigger re-signing",
                  "Webhook deliveries are deduplicated",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-lg border border-white/10 bg-background/40 p-3"
                  >
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <p className="text-sm text-foreground/90">{item}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-center text-3xl text-foreground sm:text-4xl">
              How it works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
              Three deliberate steps to protect your project while keeping contribution flow smooth.
            </p>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <article
                  key={item.step}
                  className="group rounded-xl border border-white/10 bg-card/60 p-6 transition-all hover:-translate-y-1 hover:border-primary/30"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{item.step}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 px-4 py-20">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-card/60 p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-2xl text-foreground">Org Admin</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Manage agreements, signer history, active/inactive enforcement, and CLA version
                transitions in one place.
              </p>
              <Link href="/admin" className="mt-6 inline-block">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  Open Admin Dashboard
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>

            <div className="rounded-xl border border-white/10 bg-card/60 p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-2xl text-foreground">Contributor</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Read, sign, and track agreement versions. Re-sign prompts appear automatically when
                maintainers publish a newer CLA.
              </p>
              <Link href="/contributor" className="mt-6 inline-block">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  Open Contributor View
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10" role="contentinfo">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCheck2 className="h-4 w-4" />
            <span>CLA Bot by fiveonefour</span>
          </div>
          <nav aria-label="Footer navigation" className="flex gap-6 text-sm text-muted-foreground">
            <Link
              href="https://fiveonefour.com"
              className="transition-colors hover:text-foreground"
            >
              fiveonefour.com
            </Link>
            <Link href="https://github.com" className="transition-colors hover:text-foreground">
              GitHub
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
