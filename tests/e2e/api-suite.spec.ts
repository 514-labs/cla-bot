import { test, expect } from "@playwright/test"

test("api end-to-end suite passes", async ({ request, baseURL }) => {
  expect(baseURL).toBeTruthy()

  const response = await request.get("/api/run-tests")
  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`Test endpoint failed (${response.status()}): ${body}`)
  }

  const payload = (await response.json()) as {
    summary?: { total?: number; passed?: number; failed?: number; duration?: number }
    results?: Array<{ name?: string; passed?: boolean; error?: string }>
  }

  const failed = payload.results?.filter((result) => !result.passed) ?? []
  const summary = payload.summary ?? {}

  console.log(
    `[tests] total=${summary.total ?? 0} passed=${summary.passed ?? 0} failed=${summary.failed ?? 0} duration=${summary.duration ?? 0}ms`
  )

  const details = failed
    .map((result) => `${result.name}: ${result.error ?? "Unknown error"}`)
    .join("\n")

  expect(
    summary.failed ?? failed.length,
    details || "Expected all /api/run-tests checks to pass"
  ).toBe(0)
})
