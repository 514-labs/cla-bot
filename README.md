<p align="center">
  <img src="public/brand/cla-bot-github-app-logo.svg" alt="CLA Bot" width="120" />
</p>

<h1 align="center">CLA Bot</h1>

<p align="center">
  Automate Contributor License Agreement workflows for your GitHub repos.
</p>

<p align="center">
  <a href="https://github.com/514-labs/cla-bot/actions/workflows/ci.yml"><img src="https://github.com/514-labs/cla-bot/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/514-labs/cla-bot/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js >= 20" />
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

CLA Bot is a self-hostable GitHub App that manages Contributor License Agreements for organizations and personal accounts. It enforces CLA compliance on pull requests, lets contributors sign and re-sign agreements, and gives admins full control over CLA text, versioning, and bypass lists.

## Features

- **Automated PR enforcement** — GitHub checks and comments block merging until the CLA is signed
- **CLA versioning** — text changes are tracked by SHA-256 hash; contributors are prompted to re-sign when the CLA is updated
- **Admin dashboard** — manage CLA text with live markdown preview, view signing history, configure bypass lists
- **Contributor dashboard** — view, sign, and download every CLA version
- **Org-scoped bypass lists** — exempt specific GitHub users, bots, and apps from CLA requirements
- **Async PR sync** — after signing, open PRs are automatically updated to passing
- **GitHub-native auth** — OAuth login, no separate account system
- **Stateless sessions** — JWT-based with HTTP-only cookies

## How It Works

```
Contributor opens PR
        │
        ▼
  GitHub webhook fires
        │
        ▼
  CLA Bot checks signature status
        │
   ┌────┴────┐
   │         │
Signed    Not signed
   │         │
   ▼         ▼
 ✅ Pass   ❌ Fail + comment with signing link
              │
              ▼
        Contributor signs CLA
              │
              ▼
        ✅ PR checks updated to pass
```

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm
- PostgreSQL database

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Create a `.env.local` file:

```bash
# Required
DATABASE_URL=postgres://user:pass@localhost:5432/clabot
SESSION_SECRET=your-secret-key
ENCRYPTION_KEY=your-encryption-key

# GitHub App — user authorization (sign-in) credentials.
# Found under the App's "Client ID" + "Client secrets".
# The App must have "Expire user authorization tokens" enabled.
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# GitHub App — installation/identification credentials.
GITHUB_APP_SLUG=...
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY=...
GITHUB_WEBHOOK_SECRET=...
```

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Start the dev server

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Documentation

- [Documentation Home](docs/index.md)
- [Repo Contributor docs](docs/contributor/signing-a-cla.md)
- [Repo Admin docs](docs/admin/setup-cla-bot-with-my-org.md)
- [Operator docs](docs/operator/deploy-on-my-infrastructure.md)

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm lint` | Lint and format check (Biome); warnings fail, same as CI |
| `pnpm lint:fix` | Apply Biome's safe fixes |
| `pnpm dead-code` | Unused files, exports, types and unlisted dependencies (knip); runs in CI |
| `pnpm test` | Unit + integration tests |
| `pnpm test:all` | Unit + integration + E2E tests |
| `pnpm test:unit` | Unit tests (Vitest) |
| `pnpm test:integration` | Integration tests (Vitest + PostgreSQL) |
| `pnpm test:e2e` | Browser tests (Playwright) |
| `pnpm webhook -- [options]` | Fire a synthetic GitHub webhook at a local server and time it |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Local development and testing

Everything below runs with **no real GitHub App and no remote database**. External
services are replaced by mocks that you can inspect and control.

### Run the whole app locally: `pnpm dev:local`

```bash
pnpm dev:local
```

This starts three things and wires them together:

- a persistent embedded PostgreSQL in `tmp/embedded-pg-dev` (port 5489, database
  `clabot_dev`), migrated with `pnpm db:migrate` and seeded (`SEED_DATABASE=true`);
- a mock GitHub server (`scripts/mock-github-server.ts`, default port 3998) that serves
  both the github.com OAuth endpoints and the api.github.com endpoints the app calls
  with a user token;
- `next dev` with `GITHUB_OAUTH_BASE_URL` / `GITHUB_API_BASE_URL` pointing at the mock,
  `USE_REAL_GITHUB_APP=false` (in-memory mock App client) and mock OAuth credentials.
  These overrides take precedence over anything in your `.env.local`.

Open http://localhost:3000/auth/signin and click "Continue with GitHub": instead of
GitHub you get a "Mock GitHub — choose a user" page. Pick `orgadmin` (admin of the
`fiveonefour` and `moose-stack` orgs) to use the admin pages, or any other user
(`contributor1`, `dev-sarah`, `new-contributor`, `random-dev`, `external-contributor`)
to act as a contributor. Append `&login=<user>` to the authorize URL to skip the picker.

Set `PORT` / `MOCK_GITHUB_PORT` to change ports. Ctrl-C stops everything; the database
survives between runs (delete `tmp/embedded-pg-dev` to start fresh). `pnpm mock:github`
runs just the mock server. Next.js allows one `next dev` per checkout, so stop any other
dev server first.

To exercise the webhook path while `pnpm dev:local` is running, use `pnpm webhook`
(below) and inspect the result at `/api/test-support`.

### Which database do tests use?

Integration and E2E runs always start an **embedded PostgreSQL** (`tmp/embedded-pg`,
port 5488) and run migrations against it. `.env.local` is deliberately ignored by the
test tooling because it usually holds a `vercel env pull` snapshot pointing at a real
Neon database, and the suites `TRUNCATE` tables on every reset.

- To run the suites against another database, set `TEST_DATABASE_URL` explicitly.
- Non-local hosts are refused unless you also set `ALLOW_REMOTE_TEST_DATABASE=true`.
- The embedded Postgres binaries need their `postinstall` script (it hydrates library
  symlinks). pnpm 10 only runs it for packages listed under `pnpm.onlyBuiltDependencies`
  in `package.json`, which is already configured. If `initdb` aborts with a
  `Library not loaded` error, run `pnpm install` again.
- `pnpm test:e2e` needs a browser once: `pnpm exec playwright install chromium`.
- Exit codes are trustworthy: a failing integration or e2e run exits non-zero. (The
  `embedded-postgres` package installs a process exit hook that used to force exit code
  0; `tests/setup/embedded-postgres-loader.ts` removes it.)

### Mock GitHub

When `NODE_ENV !== production` and `USE_REAL_GITHUB_APP` is not `"true"`, the app talks
to an in-memory GitHub App client (`lib/github/mock-github-client.ts`) instead of
Octokit. It ships with a pool of GitHub users (`orgadmin`, `contributor1`, `dev-sarah`,
`new-contributor`, `random-dev`, `external-contributor`), org memberships, check runs
and PR comments. The mock is instrumented:

- every call is recorded (method, args, duration, error) in an ordered call log
- `MOCK_GITHUB_LATENCY_MS=200` adds artificial latency to each call so serial chains
  show up in wall-clock time
- failures can be injected per method (e.g. make `checkOrgMembership` return a 403 once)

### The `/api/test-support` endpoint (dev only)

The test runner and the Next.js dev server are separate processes, so server-side
state is inspected and reset over HTTP. The endpoint returns 404 unless the server was
started with `ENABLE_TEST_SUPPORT=true` (the integration runner and `pnpm dev:local`
set this; a plain `pnpm dev` does not), and it is always disabled in production builds.
The `reset-db` action additionally refuses to run against a non-local database host.

```bash
# Snapshot: mock GitHub call log, check runs, comments, and the DB statement counter
curl -s localhost:3000/api/test-support | jq

# Reset in-memory state (mock GitHub + counters)
curl -s -X POST localhost:3000/api/test-support -H 'content-type: application/json' \
  -d '{"action":"reset"}'

# Truncate + re-seed the local database
curl -s -X POST localhost:3000/api/test-support -H 'content-type: application/json' \
  -d '{"action":"reset-db"}'

# Inject latency and a one-shot failure into the mock GitHub client
curl -s -X POST localhost:3000/api/test-support -H 'content-type: application/json' \
  -d '{"action":"configure-github","latencyMs":150,"failures":{"checkOrgMembership":{"status":403,"times":1}}}'
```

The DB statement counter comes from a Drizzle logger that is attached outside
production, so `db.count` after a request is the number of SQL round trips it cost.
Integration tests use this to pin a budget on the PR-check path (see the
"TEST HARNESS" section of `tests/integration/api-suite.test.ts`).

### Sending webhooks by hand

```bash
# Unsigned external contributor opens a PR against fiveonefour/sdk
pnpm webhook -- --author external-contributor --org fiveonefour --repo sdk --pr 42

# Org member, synchronize event, 10 deliveries with p50/p95 timing
pnpm webhook -- --author orgadmin --action synchronize --repeat 10 --quiet

# /recheck comment
pnpm webhook -- --event issue_comment --author contributor1 --pr 42
```

The CLI signs the payload with `GITHUB_WEBHOOK_SECRET` when set and always sends a
fresh `x-github-delivery` id, so it also works against a server that enforces
signatures and delivery dedup.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.7 (strict) |
| Database | PostgreSQL + Drizzle ORM |
| UI | Tailwind CSS, Radix UI, shadcn/ui |
| Auth | GitHub OAuth, JWT (jose) |
| GitHub API | Octokit |
| Testing | Vitest, Playwright |
| Linting | Biome |
| Deployment | Vercel |

## Architecture

```
app/
├── api/              # API routes (webhooks, auth, signing)
├── admin/            # Admin dashboard pages
├── contributor/      # Contributor dashboard pages
├── sign/             # CLA signing flow
└── auth/             # Authentication pages

lib/
├── db/               # Schema, queries, migrations
├── github/           # GitHub API client and webhook handling
├── cla/              # CLA signing and recheck workflows
├── security/         # Security utilities
└── auth.ts           # Session management

components/
├── admin/            # Admin UI components
├── sign/             # Signing flow components
└── ui/               # Design system (shadcn/ui)

tests/
├── unit/             # Vitest unit tests
├── integration/      # API integration tests
└── e2e/              # Playwright browser tests
```

## Configuration Reference

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT signing key |
| `ENCRYPTION_KEY` | OAuth token encryption key |

### GitHub Integration

| Variable | Description |
| --- | --- |
| `GITHUB_CLIENT_ID` | GitHub App user-authorization client ID (the App's own client_id) |
| `GITHUB_CLIENT_SECRET` | GitHub App user-authorization client secret |
| `GITHUB_APP_SLUG` | GitHub App slug. Also identifies the bot's comment author (`<slug>[bot]`); without it the bot never updates or deletes existing PR comments and posts fresh ones instead |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | GitHub App private key |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature verification secret |

### Optional

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Auto-detected | Override app base URL |
| `SEED_DATABASE` | `false` | Auto-seed test data on startup |
| `DRIZZLE_MIGRATIONS_SCHEMA` | `drizzle` | Migrations schema name |
| `DRIZZLE_MIGRATIONS_TABLE` | `__drizzle_migrations` | Migrations table name |

## Branch Protection

For CLA enforcement to block merging, add **CLA Bot / Contributor License Agreement** as a required status check in your GitHub branch protection rules or rulesets.

## Contributing

Contributions are welcome! Please open an issue or pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Run tests before submitting (`pnpm test && pnpm build`)
4. Open a pull request

## License

[MIT](LICENSE) &copy; [fiveonefour](https://github.com/514-labs)
