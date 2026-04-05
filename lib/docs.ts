import { readFile } from "node:fs/promises"
import path from "node:path"

export type DocsSection = "contributor" | "admin" | "operator"

export type DocRoute = {
  slug: string[]
  title: string
  description: string
  section: DocsSection | "home"
  sourcePath: string
}

const DOC_ROUTES: DocRoute[] = [
  {
    slug: [],
    title: "CLA Bot Documentation",
    description: "Role-based documentation for Contributors, Admins, and Operators.",
    section: "home",
    sourcePath: "docs/index.md",
  },
  {
    slug: ["contributor", "signing-a-cla"],
    title: "Signing a CLA",
    description: "How contributors sign or re-sign an agreement.",
    section: "contributor",
    sourcePath: "docs/contributor/signing-a-cla.md",
  },
  {
    slug: ["contributor", "signed-cla-history"],
    title: "See All CLAs I Signed",
    description: "How contributors review current and historical signatures.",
    section: "contributor",
    sourcePath: "docs/contributor/signed-cla-history.md",
  },
  {
    slug: ["contributor", "download-a-cla"],
    title: "Download a CLA",
    description: "How contributors download signed CLA records.",
    section: "contributor",
    sourcePath: "docs/contributor/download-a-cla.md",
  },
  {
    slug: ["contributor", "faq"],
    title: "Contributor FAQ",
    description: "Common contributor troubleshooting and policy questions.",
    section: "contributor",
    sourcePath: "docs/contributor/faq.md",
  },
  {
    slug: ["admin", "setup-cla-bot-with-my-org"],
    title: "Setup CLA Bot with My Org",
    description: "Install and configure CLA Bot for an organization.",
    section: "admin",
    sourcePath: "docs/admin/setup-cla-bot-with-my-org.md",
  },
  {
    slug: ["admin", "manage-installation"],
    title: "Manage the Installation",
    description: "Operate CLA Bot settings and lifecycle after setup.",
    section: "admin",
    sourcePath: "docs/admin/manage-installation.md",
  },
  {
    slug: ["admin", "faq"],
    title: "Admin FAQ",
    description: "Common admin troubleshooting and operations questions.",
    section: "admin",
    sourcePath: "docs/admin/faq.md",
  },
  {
    slug: ["operator", "deploy-on-my-infrastructure"],
    title: "Deploy CLA Bot on My Infrastructure",
    description: "Deploy and operate CLA Bot in self-hosted infrastructure.",
    section: "operator",
    sourcePath: "docs/operator/deploy-on-my-infrastructure.md",
  },
]

function slugToKey(slug: string[]) {
  return slug.join("/")
}

const DOCS_BY_KEY = new Map(DOC_ROUTES.map((route) => [slugToKey(route.slug), route]))

export function getDocRoute(slug: string[]) {
  return DOCS_BY_KEY.get(slugToKey(slug)) ?? null
}

export function getAllDocRoutes() {
  return DOC_ROUTES
}

export function getDocsNav() {
  const sections: Array<{ section: DocRoute["section"]; title: string }> = [
    { section: "home", title: "Home" },
    { section: "contributor", title: "Contributor" },
    { section: "admin", title: "Admin" },
    { section: "operator", title: "Operator" },
  ]

  return sections.map(({ section, title }) => ({
    title,
    items: DOC_ROUTES.filter((route) => route.section === section),
  }))
}

export async function readDocContent(sourcePath: string) {
  const absolutePath = path.join(process.cwd(), sourcePath)
  return readFile(absolutePath, "utf8")
}
