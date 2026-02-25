import React from "react"
import type { Metadata, Viewport } from "next"
import { Fraunces, IBM_Plex_Sans } from "next/font/google"
import { VercelToolbar } from "@vercel/toolbar/next"
import { AppFooter } from "@/components/app-footer"
import { AppBackground } from "@/components/app-background"
import { buildFiveonefourUrl } from "@/lib/marketing-links"

import "./globals.css"

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
})

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://cla.fiveonefour.com"),
  title: {
    default: "CLA Bot by fiveonefour — Automated Contributor License Agreements for GitHub",
    template: "%s | CLA Bot by fiveonefour",
  },
  description:
    "Automate Contributor License Agreements for your GitHub organization. Install the GitHub App, upload your CLA in Markdown, and automatically check every pull request. Free and open source.",
  keywords: [
    "CLA",
    "Contributor License Agreement",
    "GitHub",
    "open source",
    "pull request",
    "GitHub App",
    "CLA bot",
    "developer tools",
    "fiveonefour",
  ],
  authors: [
    {
      name: "fiveonefour",
      url: buildFiveonefourUrl({ medium: "app_metadata", content: "authors" }),
    },
  ],
  creator: "fiveonefour",
  publisher: "fiveonefour",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://cla.fiveonefour.com",
    siteName: "CLA Bot by fiveonefour",
    title: "CLA Bot — Automated Contributor License Agreements for GitHub",
    description:
      "Install the GitHub App on your organization, upload your CLA, and automatically check every pull request. Contributors sign once and contribute freely.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "CLA Bot by fiveonefour — Automate your Contributor License Agreements",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CLA Bot — Automated CLAs for GitHub",
    description:
      "Install the GitHub App, upload your CLA in Markdown, and automatically check every pull request. Free and open source.",
    images: ["/twitter-image"],
    creator: "@fiveonefour",
  },
  alternates: {
    canonical: "https://cla.fiveonefour.com",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1fbf95",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="relative font-body antialiased">
        <AppBackground />
        <div className="relative z-10">
          {children}
          <AppFooter />
        </div>
        {process.env.NODE_ENV !== "production" && <VercelToolbar />}
      </body>
    </html>
  )
}
