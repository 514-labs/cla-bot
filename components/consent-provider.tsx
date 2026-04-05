"use client"

import type React from "react"
import { ConsentManagerProvider } from "@c15t/nextjs/client"
import { CookieBanner, ConsentManagerDialog } from "@c15t/nextjs"

const backendURL = process.env.NEXT_PUBLIC_C15T_URL

const darkButton = {
  "--button-background-color": "hsl(212 30% 15%)",
  "--button-background-color-hover": "hsl(212 30% 20%)",
  "--button-text": "hsl(0 0% 97%)",
  "--button-text-hover": "hsl(0 0% 97%)",
  "--button-border-color": "hsl(213 19% 25%)",
  "--button-border-radius": "0.625rem",
  "--button-neutral": "hsl(213 19% 25%)",
  "--button-neutral-hover": "hsl(213 19% 30%)",
  "--button-neutral-soft": "hsl(212 30% 15%)",
  "--button-neutral-soft-dark": "hsl(212 30% 15%)",
  "--button-shadow": "none",
  "--button-shadow-dark": "none",
  "--button-shadow-neutral": "none",
  "--button-shadow-neutral-dark": "none",
  "--button-shadow-neutral-hover": "none",
  "--button-shadow-neutral-hover-dark": "none",
  "--button-shadow-neutral-focus": "0 0 0 2px hsl(163 69% 47%)",
  "--button-shadow-neutral-focus-dark": "0 0 0 2px hsl(163 69% 47%)",
  "--button-focus-ring": "0 0 0 2px hsl(163 69% 47%)",
} as const

const acceptButton = {
  "--button-background-color": "hsl(163 69% 47%)",
  "--button-background-color-dark": "hsl(163 69% 47%)",
  "--button-text": "hsl(204 100% 3%)",
  "--button-text-dark": "hsl(204 100% 3%)",
  "--button-text-hover": "hsl(204 100% 3%)",
  "--button-text-hover-dark": "hsl(204 100% 3%)",
  "--button-border-color": "hsl(163 69% 47%)",
  "--button-border-radius": "0.625rem",
  "--button-neutral-soft": "hsl(163 69% 47%)",
  "--button-neutral-soft-dark": "hsl(163 69% 47%)",
  "--button-shadow": "none",
  "--button-shadow-dark": "none",
  "--button-shadow-neutral": "none",
  "--button-shadow-neutral-dark": "none",
  "--button-shadow-neutral-hover": "none",
  "--button-shadow-neutral-hover-dark": "none",
  "--button-shadow-neutral-focus": "0 0 0 2px hsl(163 69% 47%)",
  "--button-shadow-neutral-focus-dark": "0 0 0 2px hsl(163 69% 47%)",
  "--button-focus-ring": "0 0 0 2px hsl(163 69% 47%)",
} as const

const saveButton = {
  "--button-background-color": "hsl(163 69% 47%)",
  "--button-background-color-dark": "hsl(163 69% 47%)",
  "--button-text": "hsl(204 100% 3%)",
  "--button-text-dark": "hsl(204 100% 3%)",
  "--button-border-color": "hsl(163 69% 47%)",
  "--button-border-radius": "0.625rem",
  "--button-primary": "hsl(204 100% 3%)",
  "--button-primary-dark": "hsl(204 100% 3%)",
  "--button-primary-hover": "hsl(204 100% 3%)",
  "--button-primary-hover-dark": "hsl(204 100% 3%)",
  "--button-shadow": "none",
  "--button-shadow-dark": "none",
  "--button-shadow-primary": "none",
  "--button-shadow-primary-dark": "none",
  "--button-shadow-primary-hover": "none",
  "--button-shadow-primary-hover-dark": "none",
  "--button-shadow-primary-focus": "0 0 0 2px hsl(163 69% 47%)",
  "--button-shadow-primary-focus-dark": "0 0 0 2px hsl(163 69% 47%)",
  "--button-focus-ring": "0 0 0 2px hsl(163 69% 47%)",
} as const

const theme = {
  "banner.card": {
    style: {
      "--banner-background-color": "hsl(212 36% 10%)",
      "--banner-border-color": "hsl(213 19% 25%)",
      "--banner-border-radius": "0.875rem",
      "--banner-shadow": "0 8px 32px rgba(0,0,0,0.4)",
    },
  },
  "banner.header.title": {
    style: { "--banner-title-color": "hsl(0 0% 97%)" },
  },
  "banner.header.description": {
    style: { "--banner-description-color": "hsl(213 14% 70%)" },
  },
  "banner.footer": {
    style: { "--banner-footer-background-color": "hsl(212 36% 10%)" },
  },
  "banner.footer.accept-button": { style: acceptButton },
  "banner.footer.reject-button": { style: darkButton },
  "banner.footer.customize-button": { style: darkButton },
  "banner.overlay": {
    style: { "--banner-overlay-background-color": "rgba(0,0,0,0.6)" },
  },
  "dialog.root": {
    style: {
      "--dialog-font-family": "var(--font-body), sans-serif",
      "--dialog-background-color": "hsl(212 36% 10%)",
      "--dialog-foreground-color": "hsl(0 0% 97%)",
      "--dialog-border-color": "hsl(213 19% 25%)",
      "--dialog-stroke-color": "hsl(213 19% 25%)",
      "--dialog-muted-color": "hsl(213 14% 70%)",
      "--dialog-card-radius": "0.875rem",
      "--dialog-card-shadow": "0 8px 32px rgba(0,0,0,0.4)",
      "--dialog-overlay-background-color": "rgba(0,0,0,0.6)",
      "--dialog-link-text-color": "hsl(0 0% 97%)",
      "--widget-background-color": "hsl(212 36% 10%)",
      "--widget-border-color": "hsl(213 19% 25%)",
      "--widget-text-color": "hsl(0 0% 97%)",
      "--widget-text-muted-color": "hsl(213 14% 70%)",
      "--widget-link-text-color": "hsl(0 0% 97%)",
      "--widget-footer-background-color": "hsl(212 36% 10%)",
      "--widget-accordion-background-color": "hsl(213 27% 18%)",
      "--widget-accordion-background-hover": "hsl(213 27% 22%)",
      "--widget-accordion-border-color": "hsl(213 19% 25%)",
      "--widget-accordion-text-color": "hsl(0 0% 97%)",
      "--widget-accordion-content-color": "hsl(213 14% 70%)",
      "--widget-accordion-icon-color": "hsl(213 14% 70%)",
      "--widget-accordion-arrow-color": "hsl(213 14% 70%)",
      "--widget-accordion-focus-ring": "hsl(163 69% 47%)",
      "--widget-accordion-radius": "0.625rem",
    },
  },
  "widget.accordion": {
    style: {
      "--accordion-background-color": "hsl(213 27% 18%)",
      "--accordion-background-color-dark": "hsl(213 27% 18%)",
      "--accordion-background-hover": "hsl(213 27% 22%)",
      "--accordion-background-hover-dark": "hsl(213 27% 22%)",
      "--accordion-border-color": "hsl(213 19% 25%)",
      "--accordion-border-color-dark": "hsl(213 19% 25%)",
      "--accordion-text-color": "hsl(0 0% 97%)",
      "--accordion-text-color-dark": "hsl(0 0% 97%)",
      "--accordion-content-color": "hsl(213 14% 70%)",
      "--accordion-content-color-dark": "hsl(213 14% 70%)",
      "--accordion-icon-color": "hsl(213 14% 70%)",
      "--accordion-icon-color-dark": "hsl(213 14% 70%)",
      "--accordion-arrow-color": "hsl(213 14% 70%)",
      "--accordion-arrow-color-dark": "hsl(213 14% 70%)",
      "--accordion-focus-ring": "hsl(163 69% 47%)",
      "--accordion-focus-ring-dark": "hsl(163 69% 47%)",
      "--accordion-focus-shadow": "0 0 0 2px hsl(163 69% 47%)",
      "--accordion-focus-shadow-dark": "0 0 0 2px hsl(163 69% 47%)",
      "--accordion-radius": "0.625rem",
    },
  },
  "widget.accordion.item": {
    style: {
      "--accordion-background-color": "hsl(213 27% 18%)",
      "--accordion-background-color-dark": "hsl(213 27% 18%)",
      "--accordion-background-hover": "hsl(213 27% 22%)",
      "--accordion-background-hover-dark": "hsl(213 27% 22%)",
      "--accordion-border-color": "hsl(213 19% 25%)",
      "--accordion-border-color-dark": "hsl(213 19% 25%)",
      "--accordion-radius": "0.625rem",
    },
  },
  "widget.switch.track": {
    style: {
      "--switch-background-color": "hsl(213 19% 25%)",
      "--switch-background-color-checked": "hsl(163 69% 47%)",
    },
  },
  "widget.footer.accept-button": { style: acceptButton },
  "widget.footer.reject-button": { style: darkButton },
  "widget.footer.save-button": { style: saveButton },
  "widget.branding": {
    style: { display: "none" },
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
      <CookieBanner theme={theme} />
      <ConsentManagerDialog theme={theme} />
    </ConsentManagerProvider>
  )
}
