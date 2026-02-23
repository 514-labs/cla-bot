import { describe, expect, it } from "vitest"
import { toSessionUserDto } from "@/lib/session-user"

describe("toSessionUserDto", () => {
  it("returns null for nullish input", () => {
    expect(toSessionUserDto(null)).toBeNull()
    expect(toSessionUserDto(undefined)).toBeNull()
  })

  it("returns only safe session fields", () => {
    const unsafeUser = {
      id: "user_1",
      githubUsername: "orgadmin",
      avatarUrl: "https://example.com/avatar.png",
      name: "Org Admin",
      role: "admin",
      githubAccessTokenEncrypted: "encrypted-token",
      githubTokenScopes: "read:user,read:org",
    } as unknown as Parameters<typeof toSessionUserDto>[0]

    const dto = toSessionUserDto(unsafeUser)

    expect(dto).toEqual({
      id: "user_1",
      githubUsername: "orgadmin",
      avatarUrl: "https://example.com/avatar.png",
      name: "Org Admin",
      role: "admin",
    })
  })
})
