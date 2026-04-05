import type { MetadataRoute } from "next"
import { getAllDocRoutes } from "@/lib/docs"

const BASE_URL = "https://cla.fiveonefour.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const docsEntries = getAllDocRoutes().map((route) => ({
    url: `${BASE_URL}${route.slug.length === 0 ? "/docs" : `/docs/${route.slug.join("/")}`}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: route.slug.length === 0 ? 0.8 : 0.6,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...docsEntries,
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ]
}
