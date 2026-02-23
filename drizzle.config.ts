import { defineConfig } from "drizzle-kit"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const isGenerateCommand = process.argv.some((arg) => arg === "generate")
const databaseUrl = process.env.DATABASE_URL ?? readDatabaseUrlFromEnvLocal()
const migrationsTable = process.env.DRIZZLE_MIGRATIONS_TABLE ?? "__drizzle_migrations"
const migrationsSchema = process.env.DRIZZLE_MIGRATIONS_SCHEMA ?? "drizzle"
if (!databaseUrl && !isGenerateCommand) {
  throw new Error("DATABASE_URL is required to run Drizzle migrate commands")
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  migrations: {
    table: migrationsTable,
    schema: migrationsSchema,
  },
  dbCredentials: {
    url: databaseUrl ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
  },
})

function readDatabaseUrlFromEnvLocal() {
  const envLocalPath = resolve(process.cwd(), ".env.local")
  if (!existsSync(envLocalPath)) {
    return undefined
  }

  const contents = readFileSync(envLocalPath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separatorIndex = line.indexOf("=")
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (key !== "DATABASE_URL") continue

    const value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1)
    }
    return value
  }

  return undefined
}
