import { vi } from "vitest"
import { TEST_USERS } from "./fixtures"

export type MockOAuthScenario =
  | "success"
  | "token_error"
  | "token_missing"
  | "user_unauthorized"
  | "user_fetch_error"
  | "network_failure"

const MOCK_ACCESS_TOKEN = "ghu_mock_access_token_1234567890"
const MOCK_REFRESH_TOKEN = "ghr_mock_refresh_token_1234567890"
const MOCK_EXPIRES_IN = 28800 // 8 hours, matches GitHub App default
const MOCK_REFRESH_TOKEN_EXPIRES_IN = 15897600 // ~6 months

const MOCK_GITHUB_USER = {
  id: Number(TEST_USERS.admin.githubId),
  login: TEST_USERS.admin.githubUsername,
  avatar_url: TEST_USERS.admin.avatarUrl,
  name: TEST_USERS.admin.name,
  email: "orgadmin@example.com",
}

const MOCK_GITHUB_EMAILS = [
  { email: "orgadmin@example.com", primary: true, verified: true },
  { email: "orgadmin+alt@example.com", primary: false, verified: true },
]

export function createMockFetch(scenario: MockOAuthScenario = "success") {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url

    // GitHub OAuth token exchange
    if (urlStr === "https://github.com/login/oauth/access_token") {
      if (scenario === "network_failure") {
        throw new Error("Network error")
      }
      if (scenario === "token_error") {
        return mockJsonResponse({
          error: "bad_verification_code",
          error_description: "The code passed is incorrect or expired.",
        })
      }
      if (scenario === "token_missing") {
        return mockJsonResponse({ scope: "read:user" }) // no access_token field
      }
      return mockJsonResponse({
        access_token: MOCK_ACCESS_TOKEN,
        expires_in: MOCK_EXPIRES_IN,
        refresh_token: MOCK_REFRESH_TOKEN,
        refresh_token_expires_in: MOCK_REFRESH_TOKEN_EXPIRES_IN,
        token_type: "bearer",
        scope: "read:user,read:org,user:email",
      })
    }

    // GitHub user profile
    if (urlStr === "https://api.github.com/user") {
      if (scenario === "user_unauthorized") {
        return mockJsonResponse({ message: "Bad credentials" }, 401)
      }
      if (scenario === "user_fetch_error") {
        return mockJsonResponse({ message: "Internal Server Error" }, 500)
      }
      return mockJsonResponse(MOCK_GITHUB_USER)
    }

    // GitHub user emails
    if (urlStr === "https://api.github.com/user/emails") {
      return mockJsonResponse(MOCK_GITHUB_EMAILS)
    }

    // Fall through to a default 404 for unhandled URLs
    return mockJsonResponse({ error: "not found" }, 404)
  })
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export {
  MOCK_ACCESS_TOKEN,
  MOCK_EXPIRES_IN,
  MOCK_GITHUB_EMAILS,
  MOCK_GITHUB_USER,
  MOCK_REFRESH_TOKEN,
  MOCK_REFRESH_TOKEN_EXPIRES_IN,
}
