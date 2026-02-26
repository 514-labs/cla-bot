import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/node_modules/**",
        "lib/db/index.ts",
        "lib/db/queries.ts",
        "lib/db/schema.ts",
        "lib/db/seed.ts",
        "lib/github/octokit-client.ts",
        "lib/github/client.ts",
        "lib/github/types.ts",
      ],
    },
  },
})
