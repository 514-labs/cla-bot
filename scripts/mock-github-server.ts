/**
 * Mock GitHub HTTP server for local development.
 *
 * Serves BOTH the github.com web endpoints (OAuth authorize / access_token) and
 * the api.github.com REST endpoints the app calls with a *user* token, so that
 * GITHUB_OAUTH_BASE_URL and GITHUB_API_BASE_URL can both point at this one
 * server. Plain `node:http`, no dependencies.
 *
 * Run directly:   pnpm exec jiti scripts/mock-github-server.ts   (MOCK_GITHUB_PORT, default 3998)
 * Or embed:       const { baseUrl, close } = await startMockGitHubServer({ port: 0 })
 *
 * Sign-in flow: GET /login/oauth/authorize renders a user picker (or redirects
 * straight away when `?login=<login>` is given) back to the app's redirect_uri
 * with `code=mock-<login>`. The token exchange turns that code into
 * `mock_access_<login>`, which every API endpoint here accepts as the identity.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { pathToFileURL } from "node:url"

type MockUser = {
  id: number
  login: string
  avatar_url: string
  html_url: string
  type: "User" | "Organization" | "Bot"
  name?: string
}

type OrgMembership = { org: string; username: string; role: "admin" | "member" }
type RepoPermission = { owner: string; repo: string; username: string; permission: string }

// Mirrors GITHUB_USERS in lib/github/mock-github-client.ts (not exported from there).
const DEFAULT_MOCK_USERS: MockUser[] = [
  { login: "orgadmin", id: 1001, name: "Org Admin" },
  { login: "contributor1", id: 1002, name: "Contributor One" },
  { login: "dev-sarah", id: 1003, name: "Sarah Dev" },
  { login: "new-contributor", id: 1004, name: "New Contributor" },
  { login: "random-dev", id: 1005, name: "Random Dev" },
  { login: "external-contributor", id: 1006, name: "External Contributor" },
].map((user) => ({
  ...user,
  avatar_url: `https://avatars.githubusercontent.com/u/${user.id}`,
  html_url: `https://github.com/${user.login}`,
  type: "User" as const,
}))

// Mirrors INITIAL_ORG_MEMBERSHIPS / INITIAL_REPO_PERMISSIONS in the mock client.
const ORG_IDS: Record<string, number> = { fiveonefour: 2001, "moose-stack": 2002 }
const ORG_MEMBERSHIPS: OrgMembership[] = [
  { org: "fiveonefour", username: "orgadmin", role: "admin" },
  { org: "moose-stack", username: "orgadmin", role: "admin" },
]
const REPO_PERMISSIONS: RepoPermission[] = [
  { owner: "fiveonefour", repo: "sdk", username: "orgadmin", permission: "admin" },
  { owner: "fiveonefour", repo: "sdk", username: "dev-sarah", permission: "maintain" },
  { owner: "moose-stack", repo: "sdk", username: "orgadmin", permission: "admin" },
]

const ACCESS_TOKEN_PREFIX = "mock_access_"
const REFRESH_TOKEN_PREFIX = "mock_refresh_"
const CODE_PREFIX = "mock-"
const TOKEN_SCOPE = "read:user,read:org,user:email"

export type MockGitHubServerOptions = {
  /** Port to listen on; `0` picks a free port (read it back from `baseUrl`). */
  port: number
  users?: MockUser[]
  /** Defaults to 127.0.0.1. */
  host?: string
  /** Set to false to silence per-request stdout logging (tests). */
  log?: boolean
}

export type MockGitHubServerHandle = {
  baseUrl: string
  port: number
  server: Server
  close(): Promise<void>
}

export async function startMockGitHubServer(
  options: MockGitHubServerOptions
): Promise<MockGitHubServerHandle> {
  const users = options.users ?? DEFAULT_MOCK_USERS
  const host = options.host ?? "127.0.0.1"
  const log = options.log ?? true
  const handler = createHandler(users, log)

  const server = createServer((req, res) => {
    handler(req, res).catch((error) => {
      console.error("[mock-github] handler error", error)
      if (!res.headersSent) {
        sendJson(res, 500, { message: "Internal mock GitHub error" })
      } else {
        res.end()
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, host, () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://${host}:${address.port}`

  return {
    baseUrl,
    port: address.port,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        // Drop keep-alive sockets so close() does not hang on idle connections.
        server.closeAllConnections()
      }),
  }
}

// ── Request routing ─────────────────────────────────────────────────

function createHandler(users: MockUser[], log: boolean) {
  const findUserByLogin = (login: string) =>
    users.find((user) => user.login.toLowerCase() === login.toLowerCase()) ?? null

  const authenticate = (req: IncomingMessage): MockUser | null => {
    const header = req.headers.authorization
    if (!header) return null
    const match = /^(?:Bearer|token)\s+(\S+)$/i.exec(header.trim())
    if (!match) return null
    const token = match[1]
    if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null
    return findUserByLogin(token.slice(ACCESS_TOKEN_PREFIX.length))
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? "GET"
    const url = new URL(req.url ?? "/", "http://mock-github.local")
    const path = url.pathname.replace(/\/+$/, "") || "/"

    res.once("finish", () => {
      if (log) console.log(`[mock-github] ${method} ${path} ${res.statusCode}`)
    })

    // ── Web (github.com) endpoints ──
    if (method === "GET" && path === "/login/oauth/authorize") {
      return handleAuthorize(url, res, users, findUserByLogin)
    }
    if (method === "POST" && path === "/login/oauth/access_token") {
      return handleAccessToken(req, res, findUserByLogin)
    }

    // ── API (api.github.com) endpoints ──
    if (method === "DELETE" && /^\/applications\/[^/]+\/grant$/.test(path)) {
      res.writeHead(204).end()
      return
    }

    if (method === "GET" && path === "/search/users") {
      return handleSearchUsers(url, res, users)
    }

    const publicUser = /^\/users\/([^/]+)$/.exec(path)
    if (method === "GET" && publicUser) {
      const user = findUserByLogin(decodeURIComponent(publicUser[1]))
      if (!user) return sendJson(res, 404, { message: "Not Found" })
      return sendJson(res, 200, publicUserPayload(user))
    }

    // Everything below requires a user token.
    const authedUser = authenticate(req)
    const requireAuth = (): MockUser | null => {
      if (!authedUser) sendJson(res, 401, { message: "Bad credentials" })
      return authedUser
    }

    if (method === "GET" && path === "/user") {
      const user = requireAuth()
      if (!user) return
      return sendJson(res, 200, { ...publicUserPayload(user), email: null })
    }

    if (method === "GET" && path === "/user/emails") {
      const user = requireAuth()
      if (!user) return
      return sendJson(res, 200, [
        { email: `${user.login}@example.com`, primary: true, verified: true, visibility: "public" },
      ])
    }

    // Octokit: orgs.listMembershipsForAuthenticatedUser
    if (method === "GET" && path === "/user/memberships/orgs") {
      const user = requireAuth()
      if (!user) return
      const state = url.searchParams.get("state")
      const memberships = ORG_MEMBERSHIPS.filter((m) => m.username === user.login)
        .map((m) => membershipPayload(m, user))
        .filter((m) => !state || m.state === state)
      return sendJson(res, 200, memberships)
    }

    // Octokit: orgs.getMembershipForAuthenticatedUser
    const ownMembership = /^\/user\/memberships\/orgs\/([^/]+)$/.exec(path)
    if (method === "GET" && ownMembership) {
      const user = requireAuth()
      if (!user) return
      const org = decodeURIComponent(ownMembership[1])
      const membership = ORG_MEMBERSHIPS.find(
        (m) => m.username === user.login && m.org.toLowerCase() === org.toLowerCase()
      )
      if (!membership) return sendJson(res, 404, { message: "Not Found" })
      return sendJson(res, 200, membershipPayload(membership, user))
    }

    // Octokit: orgs.listForAuthenticatedUser
    if (method === "GET" && path === "/user/orgs") {
      const user = requireAuth()
      if (!user) return
      const orgs = ORG_MEMBERSHIPS.filter((m) => m.username === user.login).map((m) =>
        orgPayload(m.org)
      )
      return sendJson(res, 200, orgs)
    }

    // Octokit: orgs.getMembershipForUser
    const orgMembership = /^\/orgs\/([^/]+)\/memberships\/([^/]+)$/.exec(path)
    if (method === "GET" && orgMembership) {
      if (!requireAuth()) return
      const org = decodeURIComponent(orgMembership[1])
      const username = decodeURIComponent(orgMembership[2])
      const target = findUserByLogin(username)
      const membership = target
        ? ORG_MEMBERSHIPS.find(
            (m) => m.username === target.login && m.org.toLowerCase() === org.toLowerCase()
          )
        : undefined
      if (!membership || !target) return sendJson(res, 404, { message: "Not Found" })
      return sendJson(res, 200, membershipPayload(membership, target))
    }

    // Octokit: orgs.checkMembershipForUser
    const orgMember = /^\/orgs\/([^/]+)\/members\/([^/]+)$/.exec(path)
    if (method === "GET" && orgMember) {
      if (!requireAuth()) return
      const org = decodeURIComponent(orgMember[1]).toLowerCase()
      const username = decodeURIComponent(orgMember[2]).toLowerCase()
      const isMember = ORG_MEMBERSHIPS.some(
        (m) => m.org.toLowerCase() === org && m.username.toLowerCase() === username
      )
      res.writeHead(isMember ? 204 : 404).end()
      return
    }

    const orgLookup = /^\/orgs\/([^/]+)$/.exec(path)
    if (method === "GET" && orgLookup) {
      const org = decodeURIComponent(orgLookup[1])
      if (!ORG_IDS[org.toLowerCase()]) return sendJson(res, 404, { message: "Not Found" })
      return sendJson(res, 200, orgPayload(org.toLowerCase()))
    }

    // Octokit: repos.getCollaboratorPermissionLevel
    const repoPermission = /^\/repos\/([^/]+)\/([^/]+)\/collaborators\/([^/]+)\/permission$/.exec(
      path
    )
    if (method === "GET" && repoPermission) {
      if (!requireAuth()) return
      const owner = decodeURIComponent(repoPermission[1]).toLowerCase()
      const repo = decodeURIComponent(repoPermission[2]).toLowerCase()
      const username = decodeURIComponent(repoPermission[3])
      const target = findUserByLogin(username)
      if (!target) return sendJson(res, 404, { message: "Not Found" })
      const entry = REPO_PERMISSIONS.find(
        (p) =>
          p.owner.toLowerCase() === owner &&
          p.repo.toLowerCase() === repo &&
          p.username === target.login
      )
      const permission = entry?.permission ?? "none"
      return sendJson(res, 200, {
        permission,
        role_name: permission,
        user: publicUserPayload(target),
      })
    }

    console.error(`[mock-github] unhandled ${method} ${path}`)
    sendJson(res, 404, { message: "Not Found (mock GitHub)" })
  }
}

// ── OAuth handlers ──────────────────────────────────────────────────

function handleAuthorize(
  url: URL,
  res: ServerResponse,
  users: MockUser[],
  findUserByLogin: (login: string) => MockUser | null
) {
  const redirectUri = parseRedirectUri(url.searchParams.get("redirect_uri"))
  if (!redirectUri) {
    return sendJson(res, 400, {
      error: "redirect_uri_mismatch",
      error_description: "redirect_uri must be an absolute http(s) URL on a loopback host",
    })
  }
  const state = url.searchParams.get("state") ?? ""

  const buildCallback = (login: string) => {
    const callback = new URL(redirectUri.toString())
    callback.searchParams.set("code", `${CODE_PREFIX}${login}`)
    if (state) callback.searchParams.set("state", state)
    return callback.toString()
  }

  // `?login=<user>` skips the picker. The redirect target is always built from the
  // server-side user record, never from the query string itself.
  const requestedLogin = url.searchParams.get("login")
  // This is a local OAuth mock: letting the caller choose which fake user to sign
  // in as is the feature, and the redirect target is loopback-only (see parseRedirectUri).
  const preselectedUser = requestedLogin ? findUserByLogin(requestedLogin) : null
  if (requestedLogin && !preselectedUser) {
    return sendJson(res, 404, { message: `Unknown mock user "${requestedLogin}"` })
  }
  if (preselectedUser) {
    res.writeHead(302, { Location: buildCallback(preselectedUser.login) }).end()
    return
  }

  const items = users
    .map(
      (user) =>
        `<li><a class="user" href="${escapeHtml(buildCallback(user.login))}">` +
        `<img src="${escapeHtml(user.avatar_url)}" alt="" width="32" height="32" />` +
        `<span><strong>${escapeHtml(user.login)}</strong>` +
        `<small>#${user.id}${user.name ? ` · ${escapeHtml(user.name)}` : ""}</small></span>` +
        `</a></li>`
    )
    .join("\n")

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mock GitHub — choose a user</title>
<style>
  body { font: 15px/1.4 system-ui, -apple-system, sans-serif; margin: 0; padding: 40px 16px; background: #0d1117; color: #e6edf3; }
  main { max-width: 440px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: #8b949e; margin: 0 0 20px; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .user { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; color: inherit; text-decoration: none; }
  .user:hover { border-color: #58a6ff; background: #1c2129; }
  .user img { border-radius: 50%; background: #30363d; }
  .user span { display: flex; flex-direction: column; }
  .user small { color: #8b949e; }
  code { color: #8b949e; font-size: 12px; }
</style>
</head>
<body>
<main>
  <h1>Mock GitHub — choose a user</h1>
  <p>Local development only. Pick who to sign in as; you will be sent back to
  <code>${escapeHtml(redirectUri.origin + redirectUri.pathname)}</code>.</p>
  <ul>
${items}
  </ul>
</main>
</body>
</html>
`
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
}

async function handleAccessToken(
  req: IncomingMessage,
  res: ServerResponse,
  findUserByLogin: (login: string) => MockUser | null
) {
  const body = await readBody(req)
  const contentType = req.headers["content-type"] ?? ""
  // Only the OAuth fields we act on are read; anything else in the body is ignored.
  const params: { grant_type?: string; code?: string; refresh_token?: string } = {}
  try {
    const raw: Map<string, string> = new Map()
    if (contentType.includes("application/json")) {
      const parsed = JSON.parse(body || "{}") as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") raw.set(key, value)
      }
    } else {
      for (const [key, value] of new URLSearchParams(body)) raw.set(key, value)
    }
    params.grant_type = raw.get("grant_type")
    params.code = raw.get("code")
    params.refresh_token = raw.get("refresh_token")
  } catch {
    return sendJson(res, 400, { error: "invalid_request", error_description: "Malformed body" })
  }

  let login: string | null = null
  // grant_type selecting the code vs refresh-token branch is the OAuth protocol
  // itself; tokens issued here are mock strings that only this local server accepts.
  if (params.grant_type === "refresh_token") {
    const refreshToken = params.refresh_token ?? ""
    if (refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
      login = refreshToken.slice(REFRESH_TOKEN_PREFIX.length)
    }
    if (!login || !findUserByLogin(login)) {
      return sendJson(res, 200, {
        error: "bad_refresh_token",
        error_description: "The refresh token passed is incorrect or expired.",
      })
    }
  } else {
    const code = params.code ?? ""
    if (code.startsWith(CODE_PREFIX)) login = code.slice(CODE_PREFIX.length)
    if (!login || !findUserByLogin(login)) {
      return sendJson(res, 200, {
        error: "bad_verification_code",
        error_description: "The code passed is incorrect or expired.",
      })
    }
  }

  const user = findUserByLogin(login)
  if (!user) {
    return sendJson(res, 200, {
      error: "bad_verification_code",
      error_description: "Unknown mock user.",
    })
  }
  sendJson(res, 200, {
    access_token: `${ACCESS_TOKEN_PREFIX}${user.login}`,
    refresh_token: `${REFRESH_TOKEN_PREFIX}${user.login}`,
    expires_in: 28800,
    refresh_token_expires_in: 15897600,
    token_type: "bearer",
    scope: TOKEN_SCOPE,
  })
}

function handleSearchUsers(url: URL, res: ServerResponse, users: MockUser[]) {
  const rawQuery = url.searchParams.get("q") ?? ""
  const term = rawQuery
    .split(/\s+/)
    .filter((part) => part && !part.includes(":"))
    .join(" ")
    .toLowerCase()
  const perPage = Math.max(1, Math.min(Number(url.searchParams.get("per_page") ?? "30") || 30, 100))
  const matches = term ? users.filter((user) => user.login.toLowerCase().includes(term)) : []
  sendJson(res, 200, {
    total_count: matches.length,
    incomplete_results: false,
    items: matches.slice(0, perPage).map((user) => ({ ...publicUserPayload(user), score: 1 })),
  })
}

// ── Payload helpers ─────────────────────────────────────────────────

function publicUserPayload(user: MockUser) {
  return {
    login: user.login,
    id: user.id,
    node_id: `MDQ6VXNlcj${user.id}`,
    avatar_url: user.avatar_url,
    html_url: user.html_url,
    url: `https://api.github.com/users/${user.login}`,
    type: user.type,
    site_admin: false,
    name: user.name ?? user.login,
  }
}

function orgPayload(org: string) {
  const id = ORG_IDS[org] ?? 2000
  return {
    login: org,
    id,
    node_id: `MDEyOk9yZ2FuaXphdGlvbj${id}`,
    url: `https://api.github.com/orgs/${org}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}`,
    html_url: `https://github.com/${org}`,
    description: null,
    type: "Organization",
  }
}

function membershipPayload(membership: OrgMembership, user: MockUser) {
  return {
    url: `https://api.github.com/orgs/${membership.org}/memberships/${user.login}`,
    state: "active",
    role: membership.role,
    organization_url: `https://api.github.com/orgs/${membership.org}`,
    organization: orgPayload(membership.org),
    user: publicUserPayload(user),
  }
}

// ── Low-level helpers ───────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/**
 * The mock only ever fronts a local app, so unlike real GitHub (which checks
 * the App's registered callback URLs) it accepts any redirect_uri as long as it
 * points back at a loopback address. This keeps it from being usable as an
 * open redirector if someone exposes it by accident.
 */
function parseRedirectUri(raw: string | null): URL | null {
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return null
    return parsed
  } catch {
    return null
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(payload))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// ── CLI entry point ─────────────────────────────────────────────────

const isDirectRun =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const port = Number(process.env.MOCK_GITHUB_PORT ?? "3998")
  startMockGitHubServer({ port })
    .then((handle) => {
      console.log(`[mock-github] listening on ${handle.baseUrl}`)
      console.log(
        `[mock-github] set GITHUB_OAUTH_BASE_URL=${handle.baseUrl} GITHUB_API_BASE_URL=${handle.baseUrl}`
      )
      const shutdown = () => {
        handle.close().finally(() => process.exit(0))
      }
      process.once("SIGINT", shutdown)
      process.once("SIGTERM", shutdown)
    })
    .catch((error) => {
      console.error("[mock-github] failed to start", error)
      process.exit(1)
    })
}
