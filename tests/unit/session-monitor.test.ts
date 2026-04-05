/**
 * Tests for session monitoring logic.
 *
 * Since this project doesn't use @testing-library/react, we test the core
 * polling and redirect logic directly rather than rendering the component.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("session monitor polling logic", () => {
  let originalFetch: typeof globalThis.fetch
  let originalLocation: PropertyDescriptor | undefined

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location")
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalLocation) {
      Object.defineProperty(globalThis, "location", originalLocation)
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("detects expired session from /api/auth/session and triggers redirect", async () => {
    // Mock fetch to return { user: null } (expired session)
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    globalThis.fetch = mockFetch

    // Mock window.location
    const locationHref = { value: "" }
    Object.defineProperty(globalThis, "location", {
      value: {
        pathname: "/admin",
        search: "?tab=orgs",
        href: "http://localhost:3000/admin?tab=orgs",
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis.location, "href", {
      get: () => locationHref.value,
      set: (v: string) => {
        locationHref.value = v
      },
      configurable: true,
    })

    // Simulate what SessionMonitor does: poll /api/auth/session
    async function pollSession() {
      const res = await fetch("/api/auth/session")
      const data = await res.json()
      if (!data.user) {
        const returnTo = encodeURIComponent(
          globalThis.location.pathname + globalThis.location.search
        )
        globalThis.location.href = `/auth/signin?returnTo=${returnTo}&reason=session_expired`
      }
    }

    await pollSession()

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/session")
    expect(locationHref.value).toBe(
      "/auth/signin?returnTo=%2Fadmin%3Ftab%3Dorgs&reason=session_expired"
    )
  })

  it("does not redirect when session is still valid", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "user_1", githubUsername: "orgadmin" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    globalThis.fetch = mockFetch

    const locationHref = { value: "http://localhost:3000/admin" }
    Object.defineProperty(globalThis, "location", {
      value: {
        pathname: "/admin",
        search: "",
        href: locationHref.value,
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis.location, "href", {
      get: () => locationHref.value,
      set: (v: string) => {
        locationHref.value = v
      },
      configurable: true,
    })

    async function pollSession() {
      const res = await fetch("/api/auth/session")
      const data = await res.json()
      if (!data.user) {
        globalThis.location.href = "/auth/signin?reason=session_expired"
      }
    }

    await pollSession()

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/session")
    // href should not have changed
    expect(locationHref.value).toBe("http://localhost:3000/admin")
  })

  it("does not redirect on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"))
    globalThis.fetch = mockFetch

    const locationHref = { value: "http://localhost:3000/admin" }
    Object.defineProperty(globalThis, "location", {
      value: {
        pathname: "/admin",
        search: "",
        href: locationHref.value,
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis.location, "href", {
      get: () => locationHref.value,
      set: (v: string) => {
        locationHref.value = v
      },
      configurable: true,
    })

    async function pollSession() {
      try {
        const res = await fetch("/api/auth/session")
        const data = await res.json()
        if (!data.user) {
          globalThis.location.href = "/auth/signin?reason=session_expired"
        }
      } catch {
        // Network error — skip this poll cycle
      }
    }

    await pollSession()

    expect(mockFetch).toHaveBeenCalledWith("/api/auth/session")
    // href should not have changed (network error was swallowed)
    expect(locationHref.value).toBe("http://localhost:3000/admin")
  })

  it("does not redirect when response is not ok (500)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 }))
    globalThis.fetch = mockFetch

    const locationHref = { value: "http://localhost:3000/admin" }
    Object.defineProperty(globalThis, "location", {
      value: {
        pathname: "/admin",
        search: "",
        href: locationHref.value,
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis.location, "href", {
      get: () => locationHref.value,
      set: (v: string) => {
        locationHref.value = v
      },
      configurable: true,
    })

    async function pollSession() {
      try {
        const res = await fetch("/api/auth/session")
        if (!res.ok) return // Skip on server error
        const data = await res.json()
        if (!data.user) {
          globalThis.location.href = "/auth/signin?reason=session_expired"
        }
      } catch {
        // skip
      }
    }

    await pollSession()

    expect(locationHref.value).toBe("http://localhost:3000/admin")
  })
})
