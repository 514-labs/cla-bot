import Link from "next/link"
import { SiteHeader } from "@/components/site-header"

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Terms of Use</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: February 23, 2026</p>

          <section className="mt-8 space-y-4 text-sm leading-relaxed text-foreground">
            <p>
              CLA Bot provides workflow automation for contributor license agreement checks in
              GitHub repositories.
            </p>
            <h2 className="text-lg font-semibold">Authentication</h2>
            <p>
              Access is available only through GitHub OAuth. The service does not provide username
              and password authentication.
            </p>
            <h2 className="text-lg font-semibold">Legal Effect of Signing</h2>
            <p>
              Submitting a CLA signature records your explicit assent to the displayed agreement
              hash and stores compliance evidence used for pull-request enforcement.
            </p>
            <h2 className="text-lg font-semibold">Checks and Enforcement</h2>
            <p>
              Repositories must require the status check{" "}
              <code>CLA Bot / Contributor License Agreement</code> in branch protection/rulesets for
              enforcement to block merges.
            </p>
            <h2 className="text-lg font-semibold">No User Database Accounts</h2>
            <p>
              CLA Bot does not maintain independent user accounts. GitHub identity is the sole user
              management source.
            </p>
          </section>

          <div className="mt-10">
            <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
