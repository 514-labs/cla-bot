import Link from "next/link"
import { BrandMark } from "@/components/brand-logo"

export function AppFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10" role="contentinfo">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-7 text-sm sm:flex-row">
        <p className="flex items-center gap-2 text-muted-foreground">
          <BrandMark className="h-4 w-4" />
          <span>
            Made with love by{" "}
            <Link
              href="https://fiveonefour.com"
              className="font-medium text-foreground transition-colors hover:text-primary"
            >
              fiveonefour
            </Link>
          </span>
        </p>
        <nav
          aria-label="Footer navigation"
          className="flex items-center gap-5 text-muted-foreground"
        >
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
