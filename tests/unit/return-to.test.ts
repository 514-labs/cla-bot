import { describe, expect, it } from "vitest"
import { sanitizeReturnTo } from "@/lib/security/return-to"

const FALLBACK = "/dashboard"

/**
 * Where the browser would actually land if the value were fed to
 * `NextResponse.redirect(new URL(value, request.url))`.
 */
function resolveAgainstApp(value: string): string {
  return new URL(value, "https://cla.example.com/api/auth/github").origin
}

describe("sanitizeReturnTo", () => {
  describe("legitimate relative paths", () => {
    it("passes through a plain path", () => {
      expect(sanitizeReturnTo("/admin", FALLBACK)).toBe("/admin")
    })

    it("keeps a query string", () => {
      expect(sanitizeReturnTo("/admin?tab=settings&org=foo", FALLBACK)).toBe(
        "/admin?tab=settings&org=foo"
      )
    })

    it("keeps a hash fragment", () => {
      expect(sanitizeReturnTo("/contributor/signatures#recent", FALLBACK)).toBe(
        "/contributor/signatures#recent"
      )
    })

    it("keeps query and hash together", () => {
      expect(sanitizeReturnTo("/sign/acme/repo?pr=42#cla", FALLBACK)).toBe(
        "/sign/acme/repo?pr=42#cla"
      )
    })

    it("accepts the bare root path", () => {
      expect(sanitizeReturnTo("/", FALLBACK)).toBe("/")
    })

    it("returns the caller's fallback verbatim so /admin flows keep their default", () => {
      expect(sanitizeReturnTo(null, "/admin")).toBe("/admin")
    })
  })

  describe("empty and non-relative input", () => {
    it("falls back for null", () => {
      expect(sanitizeReturnTo(null, FALLBACK)).toBe(FALLBACK)
    })

    it("falls back for undefined", () => {
      expect(sanitizeReturnTo(undefined, FALLBACK)).toBe(FALLBACK)
    })

    it("falls back for the empty string", () => {
      expect(sanitizeReturnTo("", FALLBACK)).toBe(FALLBACK)
    })

    it("falls back for an absolute URL", () => {
      expect(sanitizeReturnTo("https://evil.com/steal", FALLBACK)).toBe(FALLBACK)
    })

    it("falls back for a value that does not start with /", () => {
      expect(sanitizeReturnTo("admin", FALLBACK)).toBe(FALLBACK)
      expect(sanitizeReturnTo("evil.com/x", FALLBACK)).toBe(FALLBACK)
      expect(sanitizeReturnTo("javascript:alert(1)", FALLBACK)).toBe(FALLBACK)
    })

    it("falls back for a protocol-relative URL", () => {
      expect(sanitizeReturnTo("//evil.com/steal", FALLBACK)).toBe(FALLBACK)
    })
  })

  describe("WHATWG URL parser escape hatches", () => {
    // Each of these passes a naive `startsWith("/") && !startsWith("//")`
    // check yet resolves off-origin (or is silently rewritten) by `new URL()`.
    const attacks: Array<[label: string, value: string]> = [
      ["backslash: /\\evil.com", "/\\evil.com"],
      ["backslash-slash: /\\/evil.com", "/\\/evil.com"],
      ["newline: /\\n/evil.com", "/\n/evil.com"],
      ["carriage return: /\\r/evil.com", "/\r/evil.com"],
      ["tab: /\\tevil.com", "/\tevil.com"],
      ["space: / /evil.com", "/ /evil.com"],
      ["NUL byte", `/${String.fromCharCode(0)}/evil.com`],
      ["DEL byte", `/${String.fromCharCode(127)}/evil.com`],
    ]

    it.each(attacks)("falls back for %s", (_label, value) => {
      expect(sanitizeReturnTo(value, FALLBACK)).toBe(FALLBACK)
    })

    it("never yields a value that resolves off the app origin", () => {
      for (const [, value] of attacks) {
        const sanitized = sanitizeReturnTo(value, FALLBACK)
        expect(resolveAgainstApp(sanitized)).toBe("https://cla.example.com")
      }
    })

    it("documents that the raw attack values really do escape the origin", () => {
      // Guards against this suite becoming vacuous if URL parsing ever changes.
      expect(resolveAgainstApp("/\\evil.com")).toBe("https://evil.com")
      expect(resolveAgainstApp("/\\/evil.com")).toBe("https://evil.com")
      expect(resolveAgainstApp("/\n/evil.com")).toBe("https://evil.com")
    })
  })

  describe("dot-segment collapsing into a protocol-relative path", () => {
    // These start with a single `/` and contain no forbidden characters, but
    // collapsing `.` / `..` leaves a pathname that starts with `//`, which a
    // caller's `new URL(path, request.url)` treats as protocol-relative.
    const attacks: Array<[label: string, value: string]> = [
      ["/a/..//evil.com", "/a/..//evil.com"],
      ["/.//evil.com", "/.//evil.com"],
      ["/a/../..//evil.com/x?y=1", "/a/../..//evil.com/x?y=1"],
      ["/a/b/../..//evil.com#frag", "/a/b/../..//evil.com#frag"],
    ]

    it.each(attacks)("falls back for %s", (_label, value) => {
      expect(sanitizeReturnTo(value, FALLBACK)).toBe(FALLBACK)
    })

    it("never yields a value that resolves off the app origin", () => {
      for (const [, value] of attacks) {
        const sanitized = sanitizeReturnTo(value, FALLBACK)
        expect(resolveAgainstApp(sanitized)).toBe("https://cla.example.com")
      }
    })

    it("documents that the naive re-serialization really does escape the origin", () => {
      // Guards against this suite becoming vacuous if URL parsing ever changes.
      const collapsed = new URL("/a/..//evil.com", "http://relative.invalid")
      expect(collapsed.pathname).toBe("//evil.com")
      expect(resolveAgainstApp(collapsed.pathname)).toBe("https://evil.com")
    })

    it("still accepts an interior double slash", () => {
      expect(sanitizeReturnTo("/a//b", FALLBACK)).toBe("/a//b")
    })
  })

  describe("normalization", () => {
    it("returns the re-serialized path rather than the raw input", () => {
      // Dot segments are collapsed, so the output is canonical.
      expect(sanitizeReturnTo("/admin/../contributor", FALLBACK)).toBe("/contributor")
      // Already-encoded query values survive untouched.
      expect(sanitizeReturnTo("/admin?q=a%20b", FALLBACK)).toBe("/admin?q=a%20b")
    })
  })
})
