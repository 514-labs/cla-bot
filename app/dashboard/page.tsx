import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldCheck, Users, ArrowRight } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Choose how you want to use CLA Bot.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="group transition-colors hover:border-primary/30">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Org Admin</CardTitle>
                <CardDescription>
                  Set up CLAs for your GitHub organization. Manage agreements and view who has
                  signed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/admin">
                  <Button className="gap-2">
                    Go to Admin
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="group transition-colors hover:border-primary/30">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Contributor</CardTitle>
                <CardDescription>
                  View and sign CLAs for organizations you contribute to. See all your signed
                  agreements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/contributor">
                  <Button variant="outline" className="gap-2 bg-transparent">
                    Go to Contributor
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
