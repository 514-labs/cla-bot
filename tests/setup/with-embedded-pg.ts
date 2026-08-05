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
import { spawnSync } from "node:child_process"

async function main() {
  const [command, ...commandArgs] = process.argv.slice(2)
  if (!command) {
    console.error("Usage: jiti tests/setup/with-embedded-pg.ts <command> [args...]")
    process.exit(1)
  }

  await setup()
  try {
    // Spawn without a shell: argv is passed through as-is, so no part of it is
    // ever interpreted as shell syntax (CodeQL js/indirect-command-line-injection).
    const result = spawnSync(command, commandArgs, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    })
    if (result.error || result.status !== 0) {
      process.exitCode = result.status ?? 1
    }
  } finally {
    await teardown()
  }
}

main()
