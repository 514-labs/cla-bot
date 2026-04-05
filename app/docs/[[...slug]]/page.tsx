import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAllDocRoutes, getDocRoute, getDocsNav, readDocContent } from "@/lib/docs"

type PageProps = {
  params: Promise<{ slug?: string[] }>
}

function toHref(slug: string[]) {
  return slug.length === 0 ? "/docs" : `/docs/${slug.join("/")}`
}

export async function generateStaticParams() {
  return getAllDocRoutes().map((route) => ({ slug: route.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params
  const route = getDocRoute(slug)
  if (!route) {
    return { title: "Docs Not Found" }
  }

  return {
    title: `${route.title} | CLA Bot Docs`,
    description: route.description,
  }
}

export default async function DocsPage({ params }: PageProps) {
  const { slug = [] } = await params
  const route = getDocRoute(slug)
  if (!route) notFound()

  const [content, navSections] = await Promise.all([
    readDocContent(route.sourcePath),
    Promise.resolve(getDocsNav()),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 md:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            {navSections.map((section) => (
              <Card key={section.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {section.items.map((item) => {
                    const href = toHref(item.slug)
                    const isCurrent = item.sourcePath === route.sourcePath

                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`block rounded-md px-2 py-1 text-sm transition-colors ${
                          isCurrent
                            ? "bg-secondary font-medium text-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {item.title}
                      </Link>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </aside>

          <section>
            <Card>
              <CardHeader>
                <CardTitle>{route.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownRenderer content={content} />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  )
}
