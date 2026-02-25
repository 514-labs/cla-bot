import { spawn, type ChildProcessByStdio } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Readable } from "node:stream"

type IntegrationServer = {
  baseUrl: string
  stop: () => Promise<void>
}

type IntegrationServerProcess = ChildProcessByStdio<null, Readable, Readable>

const DEFAULT_STARTUP_TIMEOUT_MS = 90_000
const HEALTHCHECK_PATH = "/auth/signin"

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
  const databaseUrl = process.env.DATABASE_URL ?? readEnvLocalValue("DATABASE_URL")
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run integration tests")
  }
  const sessionSecret =
    process.env.SESSION_SECRET ?? process.env.TEST_SESSION_SECRET ?? "cla-bot-test-session-secret"

  const child = spawn("pnpm", ["dev", "--port", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: sessionSecret,
    },
    stdio: ["ignore", "pipe", "pipe"],
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

async function stopChildProcess(child: IntegrationServerProcess) {
  if (child.exitCode !== null) return

  child.kill("SIGTERM")
  const terminated = await waitForExit(child, 8_000)
  if (!terminated && child.exitCode === null) {
    child.kill("SIGKILL")
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

function readEnvLocalValue(key: string) {
  const envLocalPath = resolve(process.cwd(), ".env.local")
  if (!existsSync(envLocalPath)) return undefined

  const contents = readFileSync(envLocalPath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separatorIndex = line.indexOf("=")
    if (separatorIndex === -1) continue

    const candidateKey = line.slice(0, separatorIndex).trim()
    if (candidateKey !== key) continue

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
