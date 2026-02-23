import { expect, test, type BrowserContext } from "@playwright/test"
import { resetTestDatabase } from "@/tests/utils/db-reset"
import { getSessionCookie, getSessionToken, clearSessionCookieCache } from "@/tests/utils/session"
import type { TestRole } from "@/tests/utils/fixtures"

test.beforeEach(async ({ context }) => {
  await resetTestDatabase()
  clearSessionCookieCache()
  await context.clearCookies()
})

async function signInBrowser(role: TestRole, baseURL: string, context: BrowserContext) {
  const token = await getSessionToken(role)
  await context.addCookies([
    {
      name: "cla-session",
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
}

async function authedApiFetch(
  baseURL: string,
  role: TestRole,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set("cookie", await getSessionCookie(role))
  return fetch(`${baseURL}${path}`, { ...init, headers })
}

test("home and dashboard pages render core navigation", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Automate your Contributor License Agreements" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible()

  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Go to Admin" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Go to Contributor" })).toBeVisible()
})

test("legal pages are publicly available", async ({ page }) => {
  await page.goto("/terms")
  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible()

  await page.goto("/privacy")
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible()
})

test("sign-in page sanitizes external returnTo", async ({ page }) => {
  await page.goto("/auth/signin?returnTo=https://evil.example/path")
  const cta = page.getByRole("link", { name: "Continue with GitHub" })
  await expect(cta).toHaveAttribute("href", "/api/auth/github?returnTo=%2Fdashboard")
})

test("admin page shows auth-gated state when signed out", async ({ page }) => {
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible()
  await expect(
    page.getByRole("main").getByRole("button", { name: "Sign in with GitHub" })
  ).toBeVisible()
})

test("admin list and org detail pages render for signed-in admin", async ({
  page,
  baseURL,
  context,
}) => {
  expect(baseURL).toBeTruthy()
  await signInBrowser("admin", baseURL as string, context)

  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Your Organizations" })).toBeVisible()
  await expect(page.locator('a[href="/admin/fiveonefour"]')).toBeVisible()

  await page.goto("/admin/fiveonefour")
  await expect(page.getByRole("heading", { name: "Fiveonefour" })).toBeVisible()
  await expect(page.getByTestId("tab-cla")).toBeVisible()
  await expect(page.getByTestId("tab-signers")).toBeVisible()
  await expect(page.getByTestId("tab-versions")).toBeVisible()

  await page.getByTestId("tab-signers").click()
  await expect(page.getByTestId("signers-list")).toBeVisible()

  await page.getByTestId("tab-versions").click()
  await expect(page.getByTestId("version-list")).toBeVisible()
})

test("contributor page shows auth-gated state when signed out", async ({ page }) => {
  await page.goto("/contributor")
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible()
  await expect(
    page.getByRole("main").getByRole("button", { name: "Sign in with GitHub" })
  ).toBeVisible()
})

test("contributor page shows signed agreements when signed in", async ({
  page,
  baseURL,
  context,
}) => {
  expect(baseURL).toBeTruthy()
  await signInBrowser("contributor", baseURL as string, context)

  await page.goto("/contributor")
  await expect(page.getByRole("heading", { name: "My CLAs" })).toBeVisible()
  await expect(page.getByTestId("signed-count")).toContainText("Signed Agreements (2)")
  await expect(page.getByTestId("signed-cla-card").first()).toBeVisible()
})

test("sign page handles auth-gated and not-found states", async ({ page }) => {
  await page.goto("/sign/fiveonefour")
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible()

  await page.goto("/sign/does-not-exist")
  await expect(page.getByRole("heading", { name: "Organization not found" })).toBeVisible()
})

test("sign page supports re-sign flow after CLA update", async ({ page, baseURL, context }) => {
  expect(baseURL).toBeTruthy()

  const patchResponse = await authedApiFetch(baseURL as string, "admin", "/api/orgs/fiveonefour", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claMarkdown: "# Updated CLA v2\n\nPlease re-sign this version." }),
  })
  expect(patchResponse.ok).toBe(true)

  await signInBrowser("contributor", baseURL as string, context)

  await page.goto("/sign/fiveonefour")
  await expect(page.getByTestId("resign-banner")).toBeVisible()

  const scrollArea = page.getByTestId("cla-scroll-area")
  await scrollArea.evaluate((node) => {
    node.scrollTop = node.scrollHeight
    node.dispatchEvent(new Event("scroll", { bubbles: true }))
  })

  const signButton = page.getByTestId("sign-btn")
  await expect(signButton).toContainText("Re-sign Agreement")
  await signButton.click()
  await expect(page.getByTestId("signed-banner")).toBeVisible()
})
