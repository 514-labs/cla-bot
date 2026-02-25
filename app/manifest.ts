import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CLA Bot by fiveonefour",
    short_name: "CLA Bot",
    description:
      "Automate Contributor License Agreements for your GitHub organization. Install the GitHub App, upload your CLA in Markdown, and automatically check every pull request.",
    start_url: "/",
    display: "standalone",
    background_color: "#041018",
    theme_color: "#1fbf95",
    icons: [
      {
        src: "/brand/cla-bot-github-app-logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/cla-bot-github-app-logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/cla-bot-github-app-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
