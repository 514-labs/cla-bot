/**
 * Fire a synthetic GitHub webhook at a running CLA bot server and time it.
 *
 *   pnpm webhook -- --author external-contributor --org fiveonefour --repo sdk --pr 42
 *   pnpm webhook -- --author orgadmin --action synchronize --repeat 5
 *   pnpm webhook -- --event ping
 *
 * Signs the payload with GITHUB_WEBHOOK_SECRET (or --secret) when available so
 * the same command works against a server that enforces signatures. Always
 * sends a fresh x-github-delivery id so the dedup path is exercised.
 *
 * Runs with: pnpm exec jiti scripts/send-webhook.ts [options]
 */

import { createHmac, randomUUID } from "node:crypto"
import { parseArgs } from "node:util"

// `pnpm webhook -- --author x` forwards the `--` separator to the script; drop it.
const argv = process.argv.slice(2).filter((arg) => arg !== "--")

const { values } = parseArgs({
  args: argv,
  options: {
    url: { type: "string", default: process.env.WEBHOOK_TARGET_URL ?? "http://127.0.0.1:3000" },
    event: { type: "string", default: "pull_request" },
    action: { type: "string", default: "opened" },
    author: { type: "string", default: "external-contributor" },
    "author-id": { type: "string" },
    "pr-author": { type: "string" },
    org: { type: "string", default: "fiveonefour" },
    repo: { type: "string", default: "sdk" },
    pr: { type: "string", default: "1" },
    sha: { type: "string" },
    installation: { type: "string", default: "10001" },
    secret: { type: "string", default: process.env.GITHUB_WEBHOOK_SECRET },
    repeat: { type: "string", default: "1" },
    quiet: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
})

if (values.help) {
  console.log(`Usage: pnpm webhook -- [options]

  --url <base>          Server base URL (default http://127.0.0.1:3000)
  --event <name>        x-github-event (default pull_request; also: ping, issue_comment)
  --action <name>       opened | synchronize | reopened (default opened)
  --author <login>      PR author login (default external-contributor)
  --author-id <id>      PR author numeric id (defaults to the mock client's id for known logins)
  --pr-author <login>   For issue_comment: the PR author when different from the commenter (--author)
  --org <slug>          Repository owner (default fiveonefour)
  --repo <name>         Repository name (default sdk)
  --pr <number>         PR number (default 1)
  --sha <sha>           Head SHA (default: random)
  --installation <id>   installation.id in the payload (default 10001)
  --secret <secret>     HMAC secret (default $GITHUB_WEBHOOK_SECRET)
  --repeat <n>          Send n deliveries and print timing stats
  --quiet               Only print timing`)
  process.exit(0)
}

// Mirrors lib/github/mock-github-client.ts so --author works without --author-id.
const MOCK_USER_IDS: Record<string, number> = {
  orgadmin: 1001,
  contributor1: 1002,
  "dev-sarah": 1003,
  "new-contributor": 1004,
  "random-dev": 1005,
  "external-contributor": 1006,
}

function buildPayload(): Record<string, unknown> {
  const author = values.author as string
  const authorId = values["author-id"] ? Number(values["author-id"]) : MOCK_USER_IDS[author]
  const org = values.org as string
  const repo = values.repo as string
  const prNumber = Number(values.pr)
  const headSha = (values.sha as string | undefined) ?? randomUUID().replaceAll("-", "")
  const installationId = Number(values.installation)

  if (values.event === "ping") {
    return { zen: "Keep it logically awesome.", hook_id: 1 }
  }

  if (values.event === "issue_comment") {
    // `--author` is the commenter issuing /recheck; the PR author defaults to
    // the same login unless --pr-author says otherwise. The route needs both.
    const prAuthor = (values["pr-author"] as string | undefined) ?? author
    const prAuthorIdForIssue = MOCK_USER_IDS[prAuthor] ?? authorId
    return {
      action: "created",
      comment: { body: "/recheck", user: { login: author, ...(authorId ? { id: authorId } : {}) } },
      issue: {
        number: prNumber,
        user: { login: prAuthor, ...(prAuthorIdForIssue ? { id: prAuthorIdForIssue } : {}) },
        pull_request: { url: `https://api.github.com/repos/${org}/${repo}/pulls/${prNumber}` },
      },
      repository: { name: repo, owner: { login: org } },
      sender: { login: author, id: authorId },
      installation: { id: installationId },
    }
  }

  return {
    action: values.action,
    number: prNumber,
    pull_request: {
      number: prNumber,
      user: { login: author, ...(authorId ? { id: authorId } : {}) },
      head: { sha: headSha },
    },
    repository: { name: repo, owner: { login: org } },
    installation: { id: installationId },
    sender: { login: author, ...(authorId ? { id: authorId } : {}) },
  }
}

function sign(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`
}

async function sendOnce(): Promise<{ status: number; ms: number; body: unknown }> {
  const body = JSON.stringify(buildPayload())
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-github-event": values.event as string,
    "x-github-delivery": randomUUID(),
    "user-agent": "GitHub-Hookshot/cla-bot-local",
  }
  if (values.secret) headers["x-hub-signature-256"] = sign(body, values.secret)

  const started = performance.now()
  const response = await fetch(`${values.url}/api/webhook/github`, {
    method: "POST",
    headers,
    body,
  })
  const ms = performance.now() - started
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // keep raw text
  }
  return { status: response.status, ms, body: parsed }
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

async function main() {
  const repeat = Math.max(1, Number(values.repeat) || 1)
  const durations: number[] = []

  for (let i = 0; i < repeat; i += 1) {
    const result = await sendOnce()
    durations.push(result.ms)
    if (!values.quiet) {
      console.log(`[${i + 1}/${repeat}] HTTP ${result.status} in ${result.ms.toFixed(0)}ms`)
      if (repeat === 1) console.log(JSON.stringify(result.body, null, 2))
    }
    if (result.status >= 500) process.exitCode = 1
  }

  if (repeat > 1) {
    const sorted = [...durations].sort((a, b) => a - b)
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length
    console.log(
      `timing: n=${repeat} min=${sorted[0].toFixed(0)}ms p50=${percentile(sorted, 50).toFixed(0)}ms p95=${percentile(sorted, 95).toFixed(0)}ms max=${sorted[sorted.length - 1].toFixed(0)}ms avg=${avg.toFixed(0)}ms`
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
