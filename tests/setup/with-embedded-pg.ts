/**
 * Wrapper script that starts embedded Postgres before running a command.
 *
 * Usage:  jiti tests/setup/with-embedded-pg.ts <command> [args...]
 *
 * Starts embedded Postgres (if DATABASE_URL is not already set),
 * runs the given command with DATABASE_URL in the environment,
 * then tears down the database on exit.
 */
import { setup, teardown } from "./embedded-postgres"
import { execSync } from "node:child_process"

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error("Usage: jiti tests/setup/with-embedded-pg.ts <command> [args...]")
    process.exit(1)
  }

  await setup()
  try {
    execSync(args.join(" "), { stdio: "inherit", env: process.env })
  } catch (e: unknown) {
    const exitCode = (e as { status?: number }).status ?? 1
    process.exitCode = exitCode
  } finally {
    await teardown()
  }
}

main()
