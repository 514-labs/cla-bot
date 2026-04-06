"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOutAction } from "@/app/actions/auth"
import { BrandLockup } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Github, LogOut, Menu, X } from "lucide-react"
import type { SessionUserDto } from "@/lib/session-user"
import { SessionMonitor } from "@/components/session-monitor"

type SiteHeaderClientProps = {
  user: SessionUserDto | null
}

const navItems = [
  { href: "/admin", label: "Admin" },
  { href: "/contributor", label: "Contributor" },
  { href: "/docs", label: "Docs" },
]

export function SiteHeaderClient({ user }: SiteHeaderClientProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isSignedIn = !!user

  return (
    <>
      {isSignedIn && <SessionMonitor isAuthenticated />}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandLockup subtitleClassName="hidden sm:block text-[11px] text-muted-foreground" />
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            {isSignedIn && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary"
                  >
                    <Image
                      src={user.avatarUrl || "/placeholder.svg"}
                      alt={user.name}
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full"
                      sizes="28px"
                    />
                    <span className="text-sm font-medium text-foreground">{user.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {navItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "w-full cursor-pointer",
                          pathname.startsWith(item.href) && "bg-secondary"
                        )}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <form action={signOutAction} className="w-full">
                      <button type="submit" className="flex w-full items-center gap-2 text-sm">
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </form>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/auth/signin">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </Button>
              </Link>
            )}
          </div>

          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5 text-foreground" />
            ) : (
              <Menu className="h-5 w-5 text-foreground" />
            )}
          </button>
        </div>

        {mobileOpen && (
          <div id="mobile-menu" className="border-t border-white/10 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-2">
              {isSignedIn && user && (
                <div className="mb-3 flex items-center gap-3 rounded-lg bg-secondary px-3 py-2">
                  <Image
                    src={user.avatarUrl || "/placeholder.svg"}
                    alt={user.name}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full"
                    sizes="32px"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">@{user.githubUsername}</p>
                  </div>
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

              {!isSignedIn ? (
                <Link href="/auth/signin" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="mt-2 w-full gap-2 bg-transparent">
                    <Github className="h-4 w-4" />
                    Sign in with GitHub
                  </Button>
                </Link>
              ) : (
                <form action={signOutAction}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full gap-2 text-muted-foreground hover:text-foreground"
                    type="submit"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </form>
              )}
            </nav>
          </div>
        )}
      </header>
    </>
  )
}
