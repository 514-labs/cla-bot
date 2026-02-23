"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileCheck2, Github, LogOut, Menu, X } from "lucide-react"
import { useState } from "react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function SiteHeader() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Fetch current session state
  const { data: session } = useSWR("/api/auth/session", fetcher)
  const user = session?.user
  const isSignedIn = !!user

  async function handleSignOut() {
    const res = await fetch("/api/auth/logout", { method: "POST" })
    if (res.redirected) {
      window.location.href = res.url
      return
    }
    window.location.href = "/"
  }

  // Fetch feature flags
  const { data: flags } = useSWR<{ showPrPreview: boolean; showTests: boolean }>(
    "/api/flags",
    fetcher
  )

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/admin", label: "Admin" },
    { href: "/contributor", label: "Contributor" },
    ...(flags?.showPrPreview ? [{ href: "/pr-preview", label: "PR Preview" }] : []),
    ...(flags?.showTests ? [{ href: "/test", label: "Tests" }] : []),
  ]

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <FileCheck2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">CLA Bot</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">by fiveonefour</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isSignedIn ? (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs capitalize">
                {user.role}
              </Badge>
              <div className="flex items-center gap-2">
                <img
                  src={user.avatarUrl || "/placeholder.svg"}
                  alt={user.name}
                  className="h-7 w-7 rounded-full"
                  crossOrigin="anonymous"
                />
                <span className="text-sm font-medium text-foreground">{user.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="sr-only">Sign out</span>
              </Button>
            </div>
          ) : (
            <Link href="/auth/signin">
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <Github className="h-4 w-4" />
                Sign in with GitHub
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5 text-foreground" />
          ) : (
            <Menu className="h-5 w-5 text-foreground" />
          )}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="border-t px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {isSignedIn && (
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-secondary px-3 py-2">
                <img
                  src={user.avatarUrl || "/placeholder.svg"}
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                  crossOrigin="anonymous"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {user.role}
                </Badge>
              </div>
            )}
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith(item.href)
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
            {!isSignedIn && (
              <Link href="/auth/signin" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" size="sm" className="mt-2 w-full gap-2 bg-transparent">
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </Button>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
