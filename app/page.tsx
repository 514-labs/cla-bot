import Link from "next/link"
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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Navbar */}
      <header className="border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary" aria-hidden="true">
              <FileCheck2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              CLA Bot
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              by fiveonefour
            </span>
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Dashboard
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button size="sm" className="gap-2">
                <Github className="h-4 w-4" aria-hidden="true" />
                Get Started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(160 84% 39% / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(160 84% 39% / 0.3) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
          <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:py-32">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-secondary px-4 py-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Open source CLA management
            </div>
            <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Automate your Contributor License Agreements
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Install the GitHub App on your organization, upload your CLA, and
              automatically check every pull request. Contributors sign once and
              contribute freely.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auth/signin">
                <Button size="lg" className="gap-2 text-base">
                <Github className="h-5 w-5" aria-hidden="true" />
                Sign in with GitHub
              </Button>
            </Link>
            <Link href="/sign/fiveonefour">
              <Button variant="outline" size="lg" className="gap-2 text-base bg-transparent">
                View example CLA
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="mb-4 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              How it works
            </h2>
            <p className="mx-auto mb-16 max-w-xl text-center text-muted-foreground">
              Three simple steps to protect your project and welcome contributors.
            </p>
            <div className="grid gap-8 md:grid-cols-3">
              {[
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
                  title: "Upload your CLA",
                  description:
                    "Write or paste your CLA in Markdown. The agreement is shown to contributors before they can merge pull requests.",
                },
                {
                  icon: GitPullRequest,
                  step: "03",
                  title: "PRs are automatically checked",
                  description:
                    "When a non-member opens a PR, the bot posts a comment with a link to sign the CLA. Once signed, the check passes.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="group rounded-xl border bg-card p-6 transition-colors hover:border-primary/30"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Two modes */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="mb-4 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Two modes, one app
            </h2>
            <p className="mx-auto mb-16 max-w-xl text-center text-muted-foreground">
              Whether you maintain a project or contribute to one, CLA Bot has you covered.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border bg-card p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  Org Admin
                </h3>
                <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Install the bot on your GitHub organization
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Write and manage your CLA in Markdown
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    View all contributors who have signed
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Org members bypass the CLA check automatically
                  </li>
                </ul>
                <Link href="/admin" className="mt-6 inline-block">
                  <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                    Admin Dashboard
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
              <div className="rounded-xl border bg-card p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  Contributor
                </h3>
                <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Open a PR and get a friendly prompt to sign
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Read the CLA and sign with one click
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    View all CLAs you have signed
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    Sign once per org, contribute forever
                  </li>
                </ul>
                <Link href="/contributor" className="mt-6 inline-block">
                  <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                    Contributor View
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-4xl px-4 py-20 text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Protect your project. Welcome contributors.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Get started in under a minute. Free and open source.
            </p>
            <Link href="/auth/signin" className="mt-8 inline-block">
              <Button size="lg" className="gap-2 text-base">
                <Github className="h-5 w-5" aria-hidden="true" />
                Sign in with GitHub
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t" role="contentinfo">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            <span>CLA Bot by fiveonefour</span>
          </div>
          <nav aria-label="Footer navigation" className="flex gap-6 text-sm text-muted-foreground">
            <Link href="https://fiveonefour.com" className="transition-colors hover:text-foreground">
              fiveonefour.com
            </Link>
            <Link href="https://github.com" className="transition-colors hover:text-foreground">
              GitHub
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
