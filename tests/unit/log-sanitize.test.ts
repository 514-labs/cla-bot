import { describe, expect, it } from "vitest"
import { sanitizeForLog, sanitizeForLogOrNull } from "@/lib/security/log"

describe("sanitizeForLog", () => {
  it("passes through a value with no control characters", () => {
    expect(sanitizeForLog("dependabot[bot]")).toBe("dependabot[bot]")
  })

  it("strips CR and LF so a forged log line cannot be injected", () => {
    const forged = "attacker\r\n[marketplace] purchased — account=victim"
    const result = sanitizeForLog(forged)
    expect(result).not.toContain("\r")
    expect(result).not.toContain("\n")
    // A run of line breaks collapses to a single space, so "\r\n" yields one.
    expect(result).toBe("attacker [marketplace] purchased — account=victim")
  })

  it("strips other ASCII control characters", () => {
    // NUL, TAB, ESC and DEL, built without literal control bytes in the source.
    const controls = [0, 9, 27, 127].map((c) => String.fromCharCode(c))
    expect(sanitizeForLog(`a${controls[0]}b${controls[1]}c${controls[2]}d${controls[3]}e`)).toBe(
      "a b c d e"
    )
  })

  it("collapses a whole CR/LF run into a single space", () => {
    // Six line-break characters in, one space out: the run is normalized to a
    // single LF plus a separator, then the LF itself is deleted.
    expect(sanitizeForLog("a\r\n\r\n\r\nb")).toBe("a b")
  })

  it("collapses a run of other control characters into a single space", () => {
    // The second replace still collapses runs; NUL x3 built without literal
    // control bytes in the source.
    const nul = String.fromCharCode(0)
    expect(sanitizeForLog(`a${nul}${nul}${nul}b`)).toBe("a b")
  })

  it("handles non-string input without throwing", () => {
    expect(sanitizeForLog(null)).toBe("null")
    expect(sanitizeForLog(undefined)).toBe("undefined")
    expect(sanitizeForLog(42)).toBe("42")
    expect(sanitizeForLog(true)).toBe("true")
    expect(sanitizeForLog({ a: 1 })).toBe("[object Object]")
    expect(sanitizeForLog(Symbol("s"))).toBe("Symbol(s)")
  })

  it("reduces an Error to its name and single-line message", () => {
    const err = new Error("Not Found - /repos/acme\r\nfake log line")
    expect(sanitizeForLog(err)).toBe("Error: Not Found - /repos/acme fake log line")
  })

  it("does not throw on a value whose toString throws", () => {
    const hostile = {
      toString() {
        throw new Error("nope")
      },
    }
    expect(sanitizeForLog(hostile)).toBe("[unloggable value]")
  })
})

describe("sanitizeForLogOrNull", () => {
  it("preserves absent values as null", () => {
    expect(sanitizeForLogOrNull(null)).toBeNull()
    expect(sanitizeForLogOrNull(undefined)).toBeNull()
  })

  it("sanitizes present values", () => {
    expect(sanitizeForLogOrNull("main\nINFO forged")).toBe("main INFO forged")
    expect(sanitizeForLogOrNull("")).toBe("")
  })
})
