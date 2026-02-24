import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { resetTestDatabase } from "@/tests/utils/db-reset"
import { getSessionToken, clearSessionCookieCache } from "@/tests/utils/session"
import type { TestRole } from "@/tests/utils/fixtures"

test.beforeAll(async () => {
  await resetTestDatabase()
})

test.beforeEach(async ({ context }) => {
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

async function gotoStable(page: Page, path: string, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" })
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isTransientNavigationError =
        message.includes("ERR_ABORTED") || message.includes("frame was detached")
      if (!isTransientNavigationError || attempt === attempts) {
        throw error
      }
      await page.waitForTimeout(300)
    }
  }
}

test("home page renders core navigation", async ({ page }) => {
  await gotoStable(page, "/")
  await expect(
    page.getByRole("heading", { name: "Automate your Contributor License Agreements" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible()
})

test("sign-in page sanitizes external returnTo", async ({ page }) => {
  await gotoStable(page, "/auth/signin?returnTo=https://evil.example/path")
  const cta = page.getByRole("link", { name: "Continue with GitHub" })
  await expect(cta).toHaveAttribute("href", "/api/auth/github?returnTo=%2Fdashboard")
})

test("admin page shows auth-gated state when signed out", async ({ page }) => {
  await gotoStable(page, "/admin")
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible()
  await expect(
    page.getByRole("main").getByRole("button", { name: "Sign in with GitHub" })
  ).toBeVisible()
})

test("admin page does not auto-redirect when org verification fails", async ({ page }) => {
  await page.route("**/api/orgs", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Failed to verify GitHub installation admin access" }),
    })
  })

  await gotoStable(page, "/admin")
  await expect(
    page.getByRole("heading", { name: "Unable to verify organization access" })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/admin$/)
})

test("admin page does not auto-redirect when install exists but org access is empty", async ({
  page,
}) => {
  await page.route("**/api/orgs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orgs: [],
        installedOrgsCount: 1,
        user: {
          id: "user_1",
          githubUsername: "callicles",
          avatarUrl: "https://avatars.githubusercontent.com/u/1",
          name: "callicles",
          role: "admin",
        },
      }),
    })
  })

  await gotoStable(page, "/admin")
  await expect(page.getByRole("heading", { name: "No accessible organizations" })).toBeVisible()
  await expect(page).toHaveURL(/\/admin$/)
})

test("admin list page renders for signed-in admin", async ({ page, baseURL, context }) => {
  expect(baseURL).toBeTruthy()
  await signInBrowser("admin", baseURL as string, context)

  await gotoStable(page, "/admin")
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Your Organizations" })).toBeVisible()
  await expect(page.locator('a[href="/admin/fiveonefour"]')).toBeVisible()
})
