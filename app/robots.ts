import type { MetadataRoute } from "next"

const BASE_URL = "https://cla.fiveonefour.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms"],
        disallow: ["/admin/", "/contributor/", "/dashboard/", "/auth/", "/api/", "/sign/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
