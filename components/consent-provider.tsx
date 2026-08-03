"use client"

import type React from "react"
import { useEffect, useCallback } from "react"
import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
  type ConsentManagerOptions,
  type Theme,
  useConsentManager,
} from "@c15t/nextjs"
import "@c15t/nextjs/styles.css"

const backendURL = process.env.NEXT_PUBLIC_C15T_URL

/**
 * Dark palette carried over from the c15t 1.x CSS-variable theme.
 *
 * 2.x replaced the per-slot `--banner-*` / `--button-*` / `--dialog-*` variables
 * with semantic design tokens that resolve to `--c15t-*` custom properties, so
 * the old values are re-expressed as tokens here.
 */
const palette = {
  primary: "hsl(163 69% 47%)",
  primaryHover: "hsl(163 69% 47%)",
  textOnPrimary: "hsl(204 100% 3%)",
  surface: "hsl(212 36% 10%)",
  surfaceHover: "hsl(212 36% 10%)",
  border: "hsl(213 19% 25%)",
  borderHover: "hsl(213 19% 30%)",
  text: "hsl(0 0% 97%)",
  textMuted: "hsl(213 14% 70%)",
  overlay: "rgba(0,0,0,0.6)",
  switchTrack: "hsl(213 19% 25%)",
  switchTrackActive: "hsl(163 69% 47%)",
} as const

// The app renders a single dark theme and sets no `.dark` class, so the same
// palette is applied to both schemes and the scheme is pinned to dark.
const theme = {
  colors: palette,
  dark: palette,
  typography: { fontFamily: "var(--font-body), sans-serif" },
  radius: { md: "0.625rem", lg: "0.875rem" },
  shadows: { sm: "none", md: "none", lg: "0 8px 32px rgba(0,0,0,0.4)" },
  consentActions: {
    accept: { variant: "primary", mode: "filled" },
    reject: { variant: "neutral", mode: "stroke" },
    customize: { variant: "neutral", mode: "stroke" },
  },
  slots: {
    // Preserves the 1.x accordion shades, which have no semantic token, by
    // scoping the surface variables to the accordion subtree.
    consentWidgetAccordion: {
      style: {
        "--c15t-surface": "hsl(213 27% 18%)",
        "--c15t-surface-hover": "hsl(213 27% 22%)",
      },
    },
  },
} satisfies Theme

const uiOptions = {
  theme,
  colorScheme: "dark",
  legalLinks: { privacyPolicy: { href: "/privacy" }, termsOfService: { href: "/terms" } },
} satisfies Partial<ConsentManagerOptions>

const options: ConsentManagerOptions = backendURL
  ? { mode: "hosted", backendURL, ...uiOptions }
  : { mode: "offline", ...uiOptions }

function DialogDismissHandler() {
  const { activeUI, setActiveUI } = useConsentManager()
  const isDialogOpen = activeUI === "dialog"

  // 1.x used two separate setters; in 2.x a single setActiveUI("banner") closes
  // the dialog and re-shows the banner.
  const dismiss = useCallback(() => {
    setActiveUI("banner")
  }, [setActiveUI])

  useEffect(() => {
    if (!isDialogOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        dismiss()
      }
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.dataset.testid === "consent-dialog-overlay") {
        dismiss()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("click", handleClick)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("click", handleClick)
    }
  }, [isDialogOpen, dismiss])

  return null
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConsentManagerProvider options={options}>
      {children}
      <ConsentBanner hideBranding />
      <ConsentDialog hideBranding />
      <DialogDismissHandler />
    </ConsentManagerProvider>
  )
}
