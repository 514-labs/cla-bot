import { describe, expect, it } from "vitest"
import { sha256Hex } from "@/lib/db/sha256"

describe("sha256Hex", () => {
  it("produces correct hex digest for known input", async () => {
    const result = await sha256Hex("hello")
    expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
  })

  it("produces correct hex digest for empty string", async () => {
    const result = await sha256Hex("")
    expect(result).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("produces different digests for different inputs", async () => {
    const a = await sha256Hex("foo")
    const b = await sha256Hex("bar")
    expect(a).not.toBe(b)
  })
})
