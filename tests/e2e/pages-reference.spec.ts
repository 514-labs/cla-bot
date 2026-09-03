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
  await expect(page.getByRole("heading", { name: "CLA automation for GitHub orgs" })).toBeVisible()
  // Signed-out visitors get a sign-in CTA in the header; the Admin/Contributor
  // links only appear in the signed-in account menu (covered below).
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in with GitHub" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Install GitHub App" })).toBeVisible()
})

test("sign-in page sanitizes external returnTo", async ({ page }) => {
  await gotoStable(page, "/auth/signin?returnTo=https://evil.example/path")
  const cta = page.getByRole("link", { name: "Continue with GitHub" })
  await expect(cta).toHaveAttribute("href", "/api/auth/github?returnTo=%2Fdashboard")
})

test("admin page redirects to sign-in when signed out", async ({ page }) => {
  await gotoStable(page, "/admin")
  // The proxy sends unauthenticated visitors to the sign-in page, remembering
  // where they were headed.
  await expect(page).toHaveURL(/\/auth\/signin/)
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute(
    "href",
    "/api/auth/github?returnTo=%2Fadmin"
  )
})

test("admin list page renders for signed-in admin", async ({ page, baseURL, context }) => {
  expect(baseURL).toBeTruthy()
  await signInBrowser("admin", baseURL as string, context)

  await gotoStable(page, "/admin")
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Your Organizations" })).toBeVisible()
  await expect(page.locator('a[href="/admin/fiveonefour"]')).toBeVisible()
})
