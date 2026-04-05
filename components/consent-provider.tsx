"use client"

import type React from "react"
import { ConsentManagerProvider } from "@c15t/nextjs/client"
import { CookieBanner, ConsentManagerDialog } from "@c15t/nextjs"

const backendURL = process.env.NEXT_PUBLIC_C15T_URL

const bannerTheme = {
  "banner.card": {
    style: {
      "--banner-background-color": "hsl(212 36% 10%)",
      "--banner-border-color": "hsl(213 19% 25%)",
      "--banner-border-radius": "0.875rem",
      "--banner-shadow": "0 8px 32px rgba(0,0,0,0.4)",
    },
  },
  "banner.header.title": {
    style: {
      "--banner-title-color": "hsl(0 0% 97%)",
    },
  },
  "banner.header.description": {
    style: {
      "--banner-description-color": "hsl(213 14% 70%)",
    },
  },
  "banner.footer": {
    style: {
      "--banner-footer-background-color": "hsl(212 36% 10%)",
    },
  },
  "banner.footer.accept-button": {
    style: {
      "--button-background-color": "hsl(163 69% 47%)",
      "--button-background-color-hover": "hsl(163 69% 40%)",
      "--button-text": "hsl(204 100% 3%)",
      "--button-border-color": "hsl(163 69% 47%)",
      "--button-border-radius": "0.625rem",
    },
  },
  "banner.footer.reject-button": {
    style: {
      "--button-background-color": "hsl(212 30% 15%)",
      "--button-background-color-hover": "hsl(212 30% 20%)",
      "--button-text": "hsl(0 0% 97%)",
      "--button-border-color": "hsl(213 19% 25%)",
      "--button-border-radius": "0.625rem",
    },
  },
  "banner.footer.customize-button": {
    style: {
      "--button-background-color": "hsl(212 30% 15%)",
      "--button-background-color-hover": "hsl(212 30% 20%)",
      "--button-text": "hsl(0 0% 97%)",
      "--button-border-color": "hsl(213 19% 25%)",
      "--button-border-radius": "0.625rem",
    },
  },
  "banner.overlay": {
    style: {
      "--banner-overlay-background-color": "rgba(0,0,0,0.6)",
    },
  },
} as const

const dialogTheme = {
  "dialog.card": {
    style: {
      "--banner-background-color": "hsl(212 36% 10%)",
      "--banner-border-color": "hsl(213 19% 25%)",
      "--banner-border-radius": "0.875rem",
    },
  },
  "dialog.title": {
    style: {
      "--banner-title-color": "hsl(0 0% 97%)",
    },
  },
  "dialog.description": {
    style: {
      "--banner-description-color": "hsl(213 14% 70%)",
    },
  },
  "dialog.overlay": {
    style: {
      "--banner-overlay-background-color": "rgba(0,0,0,0.6)",
    },
  },
  "widget.root": {
    style: {
      "--widget-font-family": "var(--font-body), sans-serif",
    },
  },
  "widget.accordion": {
    style: {
      "--accordion-background-color": "hsl(213 27% 18%)",
      "--accordion-border-color": "hsl(213 19% 25%)",
      "--accordion-text-color": "hsl(0 0% 97%)",
      "--accordion-content-color": "hsl(213 14% 70%)",
      "--accordion-icon-color": "hsl(213 14% 70%)",
      "--accordion-radius": "0.625rem",
    },
  },
  "widget.accordion.item": {
    style: {
      "--accordion-background-color": "hsl(213 27% 18%)",
      "--accordion-border-color": "hsl(213 19% 25%)",
      "--accordion-radius": "0.625rem",
    },
  },
  "widget.switch.track": {
    style: {
      "--switch-background-color": "hsl(213 19% 25%)",
      "--switch-background-color-checked": "hsl(163 69% 47%)",
    },
  },
  "widget.footer.accept-button": {
    style: {
      "--button-background-color": "hsl(163 69% 47%)",
      "--button-background-color-hover": "hsl(163 69% 40%)",
      "--button-text": "hsl(204 100% 3%)",
      "--button-border-color": "hsl(163 69% 47%)",
      "--button-border-radius": "0.625rem",
    },
  },
  "widget.footer.reject-button": {
    style: {
      "--button-background-color": "hsl(212 30% 15%)",
      "--button-background-color-hover": "hsl(212 30% 20%)",
      "--button-text": "hsl(0 0% 97%)",
      "--button-border-color": "hsl(213 19% 25%)",
      "--button-border-radius": "0.625rem",
    },
  },
  "widget.footer.save-button": {
    style: {
      "--button-background-color": "hsl(163 69% 47%)",
      "--button-background-color-hover": "hsl(163 69% 40%)",
      "--button-text": "hsl(204 100% 3%)",
      "--button-border-color": "hsl(163 69% 47%)",
      "--button-border-radius": "0.625rem",
    },
  },
} as const

const options = backendURL
  ? {
      mode: "c15t" as const,
      backendURL,
      legalLinks: { privacyPolicy: { href: "/privacy" }, termsOfService: { href: "/terms" } },
    }
  : {
      mode: "offline" as const,
      legalLinks: { privacyPolicy: { href: "/privacy" }, termsOfService: { href: "/terms" } },
    }

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConsentManagerProvider options={options}>
      {children}
      <CookieBanner theme={bannerTheme} />
      <ConsentManagerDialog theme={dialogTheme} />
    </ConsentManagerProvider>
  )
}
