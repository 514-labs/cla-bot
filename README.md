<p align="center">
  <img src="public/brand/cla-bot-github-app-logo.svg" alt="CLA Bot" width="120" />
</p>

<h1 align="center">CLA Bot</h1>

<p align="center">
  Automate Contributor License Agreement workflows for your GitHub repos.
</p>

<p align="center">
  <a href="https://github.com/514-labs/cla-bot/actions/workflows/ci.yml"><img src="https://github.com/514-labs/cla-bot/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://raw.githubusercontent.com/514-labs/cla-bot/badges/coverage.svg"><img src="https://raw.githubusercontent.com/514-labs/cla-bot/badges/coverage.svg" alt="Coverage" /></a>
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

# GitHub OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# GitHub App
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

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm lint` | Lint and format check (Biome) |
| `pnpm test` | Unit + integration tests |
| `pnpm test:all` | Unit + integration + E2E tests |
| `pnpm test:unit` | Unit tests (Vitest) |
| `pnpm test:integration` | Integration tests (Vitest + PostgreSQL) |
| `pnpm test:e2e` | Browser tests (Playwright) |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio |

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
| `GITHUB_CLIENT_ID` | OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | OAuth app client secret |
| `GITHUB_APP_SLUG` | GitHub App slug |
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
