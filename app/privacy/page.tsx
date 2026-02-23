import Link from "next/link"
import { SiteHeader } from "@/components/site-header"

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: February 23, 2026</p>

          <section className="mt-8 space-y-4 text-sm leading-relaxed text-foreground">
            <p>
              CLA Bot processes GitHub identity and CLA-signature evidence to enforce contributor
              license agreement requirements for GitHub organizations.
            </p>
            <h2 className="text-lg font-semibold">Data We Process</h2>
            <p>
              We process GitHub account identifiers, usernames, avatar/name metadata, session
              identifiers, CLA signature timestamps, signed CLA hashes, and webhook audit metadata.
            </p>
            <h2 className="text-lg font-semibold">Purpose</h2>
            <p>
              We use this data to determine whether contributors have signed the current CLA and to
              update PR checks/comments accordingly.
            </p>
            <h2 className="text-lg font-semibold">Retention</h2>
            <p>
              Signature records and compliance audit logs are retained indefinitely to preserve
              legal evidence of consent and enforcement decisions.
            </p>
            <h2 className="text-lg font-semibold">Your Rights</h2>
            <p>
              You may request access to your profile/session data and correction of inaccurate
              metadata. Legal signature records may be retained when required for compliance and
              evidentiary purposes.
            </p>
            <h2 className="text-lg font-semibold">Contact</h2>
            <p>
              For privacy requests, contact repository maintainers for the organization where you
              signed the CLA.
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
