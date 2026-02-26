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
      include: ["lib/**/*.ts", "app/**/*.ts", "app/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
    },
  },
})
