import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      // server-only throws when imported outside Next.js server context.
      // Integration tests run directly in Node via Vitest, so mock it out.
      "server-only": fileURLToPath(new URL("tests/utils/server-only-mock.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/utils/setup-env.ts"],
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    maxWorkers: 1,
  },
})
