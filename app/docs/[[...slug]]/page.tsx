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

type TocItem = {
  level: 2 | 3
  text: string
  id: string
}

function toHref(slug: string[]) {
  return slug.length === 0 ? "/docs" : `/docs/${slug.join("/")}`
}

function sectionLabel(section: string) {
  if (section === "home") return "Documentation"
  return `${section[0].toUpperCase()}${section.slice(1)} Guide`
}

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/&[^\s;]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = []
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim()
      items.push({ level: 2, text, id: slugifyHeading(text) })
    } else if (line.startsWith("### ")) {
      const text = line.slice(4).trim()
      items.push({ level: 3, text, id: slugifyHeading(text) })
    }
  }
  return items
}

function stripLeadingH1(markdown: string) {
  return markdown.replace(/^#\s+.+\n+/, "")
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

  const [rawContent, navSections] = await Promise.all([
    readDocContent(route.sourcePath),
    Promise.resolve(getDocsNav()),
  ])

  const content = stripLeadingH1(rawContent)
  const toc = extractToc(content)
  const docsSequence = getAllDocRoutes()
  const docIndex = docsSequence.findIndex((item) => item.sourcePath === route.sourcePath)
  const prevDoc = docIndex > 0 ? docsSequence[docIndex - 1] : null
  const nextDoc = docIndex < docsSequence.length - 1 ? docsSequence[docIndex + 1] : null

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 py-10 xl:grid-cols-[250px_minmax(0,1fr)_230px]">
          <aside className="space-y-4 xl:sticky xl:top-20 xl:h-fit">
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
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
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

          <section className="min-w-0">
            <Card>
              <CardContent className="space-y-8 p-6 sm:p-8">
                <div className="space-y-2 border-b border-white/10 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {sectionLabel(route.section)}
                  </p>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    {route.title}
                  </h1>
                  <p className="max-w-3xl text-sm text-muted-foreground">{route.description}</p>
                </div>

                <MarkdownRenderer content={content} />

                {(prevDoc || nextDoc) && (
                  <div className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
                    <div>
                      {prevDoc && (
                        <Link
                          href={toHref(prevDoc.slug)}
                          className="block rounded-md border border-white/10 p-3 text-sm hover:bg-secondary"
                        >
                          <p className="text-xs text-muted-foreground">Previous</p>
                          <p className="font-medium text-foreground">{prevDoc.title}</p>
                        </Link>
                      )}
                    </div>
                    <div>
                      {nextDoc && (
                        <Link
                          href={toHref(nextDoc.slug)}
                          className="block rounded-md border border-white/10 p-3 text-right text-sm hover:bg-secondary"
                        >
                          <p className="text-xs text-muted-foreground">Next</p>
                          <p className="font-medium text-foreground">{nextDoc.title}</p>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <aside className="hidden xl:block">
            {toc.length > 0 && (
              <Card className="sticky top-20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">On this page</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {toc.map((item) => (
                    <a
                      key={`${item.level}-${item.id}`}
                      href={`#${item.id}`}
                      className={`block text-sm text-muted-foreground hover:text-foreground ${
                        item.level === 3 ? "pl-3" : ""
                      }`}
                    >
                      {item.text}
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}
