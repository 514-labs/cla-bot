import { spawn, type ChildProcessByStdio } from "node:child_process"
import { resolve } from "node:path"
import type { Readable } from "node:stream"
import { requireTestDatabaseUrl } from "./test-database-url"

type IntegrationServer = {
  baseUrl: string
  stop: () => Promise<void>
}

type IntegrationServerProcess = ChildProcessByStdio<null, Readable, Readable>

const DEFAULT_STARTUP_TIMEOUT_MS = 90_000
const HEALTHCHECK_PATH = "/api/auth/session"

export async function startIntegrationServer(): Promise<IntegrationServer> {
  const externalBaseUrl = process.env.TEST_BASE_URL ?? process.env.INTEGRATION_BASE_URL
  if (externalBaseUrl) {
    return {
      baseUrl: externalBaseUrl,
      stop: async () => {},
    }
  }

  const port = Number.parseInt(process.env.TEST_INTEGRATION_PORT ?? "3310", 10)
  const baseUrl = `http://127.0.0.1:${port}`
  const databaseUrl = requireTestDatabaseUrl()
  const sessionSecret =
    process.env.SESSION_SECRET ?? process.env.TEST_SESSION_SECRET ?? "cla-bot-test-session-secret"

  // A server already answering on this port is almost certainly an orphan from
  // an earlier run, wired to a database that no longer exists. Using it would
  // make the whole suite hang, so fail loudly instead.
  await assertPortIsFree(baseUrl, port)

  // Spawn the Next.js binary directly (not through `pnpm dev`) so the process
  // we hold is the one that owns the server, and put it in its own process
  // group so `stop()` can take down `next dev` *and* the `next-server` worker it
  // forks. Killing only a `pnpm` wrapper leaves that worker running.
  //
  // Next.js loads `.env.local` but never overrides variables already present in
  // the process environment, so everything set here wins over a developer's
  // local snapshot. Pin the knobs the suites depend on: the test database, the
  // in-memory mock GitHub client, and no startup seeding (tests seed themselves).
  const nextBin = resolve(process.cwd(), "node_modules", ".bin", "next")
  const child = spawn(nextBin, ["dev", "--port", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
      USE_REAL_GITHUB_APP: "false",
      SEED_DATABASE: "false",
      MOCK_GITHUB_LATENCY_MS: process.env.MOCK_GITHUB_LATENCY_MS ?? "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })

  const outputBuffer: string[] = []
  const pushOutput = (chunk: Buffer) => {
    outputBuffer.push(chunk.toString("utf8"))
    if (outputBuffer.length > 60) {
      outputBuffer.shift()
    }
  }
  child.stdout.on("data", pushOutput)
  child.stderr.on("data", pushOutput)

  await waitForServerReady({
    baseUrl,
    child,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    getOutput: () => outputBuffer.join(""),
  })

  return {
    baseUrl,
    stop: async () => {
      await stopChildProcess(child)
    },
  }
}

async function waitForServerReady(params: {
  baseUrl: string
  child: IntegrationServerProcess
  startupTimeoutMs: number
  getOutput: () => string
}) {
  const { baseUrl, child, startupTimeoutMs, getOutput } = params
  const startedAt = Date.now()
  const healthUrl = `${baseUrl}${HEALTHCHECK_PATH}`

  while (Date.now() - startedAt < startupTimeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `Integration server exited early (code=${child.exitCode}). Output:\n${getOutput()}`
      )
    }

    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Server still booting.
    }

    await sleep(300)
  }

  await stopChildProcess(child)
  throw new Error(
    `Timed out waiting for integration server at ${healthUrl}. Output:\n${getOutput()}`
  )
}

async function assertPortIsFree(baseUrl: string, port: number) {
  let responded = false
  try {
    const response = await fetch(`${baseUrl}${HEALTHCHECK_PATH}`, {
      signal: AbortSignal.timeout(1_500),
    })
    responded = response.status > 0
  } catch {
    // Connection refused / timeout = nobody is listening, which is what we want.
  }
  if (responded) {
    throw new Error(
      `Port ${port} is already serving ${HEALTHCHECK_PATH}. A stale integration server is probably still running ` +
        `(try: lsof -nP -iTCP:${port} -sTCP:LISTEN). Stop it, or set TEST_INTEGRATION_PORT to another port.`
    )
  }
}

/** Signal the child's whole process group, falling back to the child alone. */
function signalProcessTree(child: IntegrationServerProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // Already gone.
    }
  }
}

async function stopChildProcess(child: IntegrationServerProcess) {
  if (child.exitCode !== null) return

  signalProcessTree(child, "SIGTERM")
  const terminated = await waitForExit(child, 8_000)
  if (!terminated && child.exitCode === null) {
    signalProcessTree(child, "SIGKILL")
    await waitForExit(child, 2_000)
  }
}

async function waitForExit(child: IntegrationServerProcess, timeoutMs: number) {
  if (child.exitCode !== null) return true

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)

    const onExit = () => {
      cleanup()
      resolve(true)
    }

    const cleanup = () => {
      clearTimeout(timeout)
      child.off("exit", onExit)
    }

    child.on("exit", onExit)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
