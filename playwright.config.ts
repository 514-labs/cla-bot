import { defineConfig } from "@playwright/test"

const PORT = Number.parseInt(
  process.env.TEST_PORT ?? process.env.PLAYWRIGHT_TEST_PORT ?? "3210",
  10
)
const BASE_URL =
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`
const SHOULD_START_WEB_SERVER = !process.env.TEST_BASE_URL && !process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
  },
  webServer: SHOULD_START_WEB_SERVER
    ? {
        command: `pnpm dev --port ${PORT}`,
        url: `${BASE_URL}/api/flags`,
        timeout: 90_000,
        reuseExistingServer: true,
      }
    : undefined,
})
