import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { encryptSecret, decryptSecret } from "@/lib/security/encryption"

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", "test-encryption-key-for-unit-tests")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("encryptSecret / decryptSecret round-trip", () => {
  it("encrypts and decrypts back to original plaintext", () => {
    const plainText = "my-secret-token"
    const encrypted = encryptSecret(plainText)
    expect(encrypted).not.toBeNull()
    expect(encrypted).not.toBe(plainText)

    const decrypted = decryptSecret(encrypted as string)
    expect(decrypted).toBe(plainText)
  })

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const encrypted1 = encryptSecret("same-input")
    const encrypted2 = encryptSecret("same-input")
    expect(encrypted1).not.toBe(encrypted2)

    // Both decrypt to the same value
    expect(decryptSecret(encrypted1 as string)).toBe("same-input")
    expect(decryptSecret(encrypted2 as string)).toBe("same-input")
  })

  it("returns dot-delimited payload with three parts", () => {
    const encrypted = encryptSecret("test")
    expect(encrypted).not.toBeNull()
    const parts = (encrypted as string).split(".")
    expect(parts).toHaveLength(3)
  })

  it("handles unicode and special characters", () => {
    const plainText = "héllo wörld 🔑"
    const encrypted = encryptSecret(plainText)
    expect(encrypted).not.toBeNull()
    expect(decryptSecret(encrypted as string)).toBe(plainText)
  })
})

describe("encryptSecret without key", () => {
  it("returns null when no ENCRYPTION_KEY or SESSION_SECRET is set", () => {
    vi.stubEnv("ENCRYPTION_KEY", "")
    vi.stubEnv("SESSION_SECRET", "")
    delete process.env.ENCRYPTION_KEY
    delete process.env.SESSION_SECRET
    expect(encryptSecret("test")).toBeNull()
  })
})

describe("decryptSecret edge cases", () => {
  it("returns null for malformed payload (no dots)", () => {
    expect(decryptSecret("notavalidpayload")).toBeNull()
  })

  it("returns null for payload with wrong key", () => {
    const encrypted = encryptSecret("secret") as string
    vi.stubEnv("ENCRYPTION_KEY", "different-key-entirely-new")
    // The decryption with a different key should fail
    expect(decryptSecret(encrypted)).toBeNull()
  })

  it("falls back to SESSION_SECRET when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY
    vi.stubEnv("SESSION_SECRET", "session-secret-fallback-key")
    const encrypted = encryptSecret("fallback-test")
    expect(encrypted).not.toBeNull()
    expect(decryptSecret(encrypted as string)).toBe("fallback-test")
  })
})
