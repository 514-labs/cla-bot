import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("handles conditional classes", () => {
    expect(cn("text-red-500", false && "hidden", "font-bold")).toBe("text-red-500 font-bold")
  })

  it("handles empty input", () => {
    expect(cn()).toBe("")
  })
})
