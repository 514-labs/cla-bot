import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  startMockGitHubServer,
  type MockGitHubServerHandle,
} from "../../scripts/mock-github-server"

let server: MockGitHubServerHandle

beforeAll(async () => {
  server = await startMockGitHubServer({ port: 0, log: false })
})

afterAll(async () => {
  await server.close()
})

const REDIRECT_URI = "http://localhost:3000/api/auth/github"

describe("mock GitHub server", () => {
  it("binds a real port and reports it in baseUrl", () => {
    expect(server.port).toBeGreaterThan(0)
    expect(server.baseUrl).toBe(`http://127.0.0.1:${server.port}`)
  })

  it("redirects straight back to redirect_uri when ?login= is given", async () => {
    const url = new URL("/login/oauth/authorize", server.baseUrl)
    url.searchParams.set("client_id", "mock-client-id")
    url.searchParams.set("redirect_uri", REDIRECT_URI)
    url.searchParams.set("state", "abc-123")
    url.searchParams.set("login", "orgadmin")

    const res = await fetch(url, { redirect: "manual" })
    expect(res.status).toBe(302)

    const location = new URL(res.headers.get("location") ?? "")
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI)
    expect(location.searchParams.get("code")).toBe("mock-orgadmin")
    expect(location.searchParams.get("state")).toBe("abc-123")
  })

  it("renders a user picker when no login is given", async () => {
    const url = new URL("/login/oauth/authorize", server.baseUrl)
    url.searchParams.set("redirect_uri", REDIRECT_URI)
    url.searchParams.set("state", "abc-123")

    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    const html = await res.text()
    expect(html).toContain("<title>Mock GitHub — choose a user</title>")
    expect(html).toContain("code=mock-dev-sarah")
    expect(html).toContain("code=mock-orgadmin")
  })

  it("rejects non-http redirect_uri values", async () => {
    const url = new URL("/login/oauth/authorize", server.baseUrl)
    url.searchParams.set("redirect_uri", "javascript:alert(1)")
    const res = await fetch(url, { redirect: "manual" })
    expect(res.status).toBe(400)
  })

  it("exchanges a mock code for tokens", async () => {
    const res = await fetch(`${server.baseUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: "mock-client-id",
        client_secret: "mock-client-secret",
        code: "mock-orgadmin",
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      access_token: "mock_access_orgadmin",
      refresh_token: "mock_refresh_orgadmin",
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
      token_type: "bearer",
      scope: "read:user,read:org,user:email",
    })
  })

  it("refreshes a mock refresh token", async () => {
    const res = await fetch(`${server.baseUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: "mock-client-id",
        client_secret: "mock-client-secret",
        grant_type: "refresh_token",
        refresh_token: "mock_refresh_dev-sarah",
      }),
    })
    const body = await res.json()
    expect(body.access_token).toBe("mock_access_dev-sarah")
  })

  it("returns bad_verification_code for unknown codes", async () => {
    const res = await fetch(`${server.baseUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: "x", client_secret: "y", code: "mock-nobody" }),
    })
    const body = await res.json()
    expect(body.error).toBe("bad_verification_code")
  })

  it("serves /user for a valid token and 401 otherwise", async () => {
    const ok = await fetch(`${server.baseUrl}/user`, {
      headers: { Authorization: "Bearer mock_access_orgadmin" },
    })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({
      id: 1001,
      login: "orgadmin",
      type: "User",
      email: null,
      avatar_url: "https://avatars.githubusercontent.com/u/1001",
      html_url: "https://github.com/orgadmin",
    })

    const bad = await fetch(`${server.baseUrl}/user`, {
      headers: { Authorization: "Bearer nope" },
    })
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({ message: "Bad credentials" })
  })

  it("accepts Octokit's `token` auth scheme", async () => {
    const res = await fetch(`${server.baseUrl}/user`, {
      headers: { Authorization: "token mock_access_contributor1" },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).login).toBe("contributor1")
  })

  it("serves /user/emails", async () => {
    const res = await fetch(`${server.baseUrl}/user/emails`, {
      headers: { Authorization: "Bearer mock_access_dev-sarah" },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      expect.objectContaining({ email: "dev-sarah@example.com", primary: true, verified: true }),
    ])
  })

  it("searches users by login substring, ignoring qualifiers", async () => {
    const url = new URL("/search/users", server.baseUrl)
    url.searchParams.set("q", "contributor in:login")
    url.searchParams.set("per_page", "8")
    const res = await fetch(url, { headers: { Authorization: "Bearer mock_access_orgadmin" } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.incomplete_results).toBe(false)
    expect(body.total_count).toBe(3)
    expect(body.items.map((item: { login: string }) => item.login).sort()).toEqual([
      "contributor1",
      "external-contributor",
      "new-contributor",
    ])
  })

  it("reports orgadmin as an active admin of its orgs (admin-authorization endpoints)", async () => {
    const list = await fetch(`${server.baseUrl}/user/memberships/orgs?state=active&per_page=100`, {
      headers: { Authorization: "token mock_access_orgadmin" },
    })
    expect(list.status).toBe(200)
    const memberships = await list.json()
    expect(
      memberships.map((m: { organization: { login: string } }) => m.organization.login).sort()
    ).toEqual(["fiveonefour", "moose-stack"])
    for (const m of memberships) {
      expect(m).toMatchObject({ state: "active", role: "admin" })
    }

    const single = await fetch(`${server.baseUrl}/user/memberships/orgs/fiveonefour`, {
      headers: { Authorization: "token mock_access_orgadmin" },
    })
    expect(single.status).toBe(200)
    expect(await single.json()).toMatchObject({
      state: "active",
      role: "admin",
      organization: { login: "fiveonefour" },
    })

    const nonMember = await fetch(`${server.baseUrl}/user/memberships/orgs/fiveonefour`, {
      headers: { Authorization: "token mock_access_random-dev" },
    })
    expect(nonMember.status).toBe(404)
  })

  it("reports repo collaborator permission levels", async () => {
    const res = await fetch(
      `${server.baseUrl}/repos/fiveonefour/sdk/collaborators/dev-sarah/permission`,
      { headers: { Authorization: "Bearer mock_access_orgadmin" } }
    )
    expect(res.status).toBe(200)
    expect((await res.json()).permission).toBe("maintain")
  })

  it("revokes grants with 204", async () => {
    const res = await fetch(`${server.baseUrl}/applications/mock-client-id/grant`, {
      method: "DELETE",
      headers: { Authorization: "Basic abc" },
    })
    expect(res.status).toBe(204)
  })

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await fetch(`${server.baseUrl}/nope/nothing`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ message: "Not Found (mock GitHub)" })
  })
})
