# Repository Guidelines

## Project Structure & Module Organization
This repo is a Next.js 16 + TypeScript app-router project.
- `app/`: routes, pages, layouts, and API handlers (`app/api/**/route.ts`).
- `components/`: shared UI and feature components (`components/ui/*` for design-system primitives).
- `lib/`: core logic (auth, GitHub client wrappers, database queries/schema, test harness).
- `hooks/`: reusable React hooks.
- `public/`: static assets.
- `drizzle/`: generated Drizzle SQL migrations and metadata.
- `tests/`: test suites (`tests/unit/*` for Vitest, `tests/e2e/*` for Playwright).
- `styles/` and `app/globals.css`: global styling.

## Build, Test, and Development Commands
Use `pnpm` (lockfile is `pnpm-lock.yaml`).
- `pnpm dev`: start local dev server.
- `pnpm build`: production build (includes TypeScript checks).
- `pnpm start`: run production server from build output.
- `pnpm lint`: run Biome checks across the repo.
- `pnpm test`: run unit + e2e test suites.
- `pnpm test:unit`: run Vitest tests.
- `pnpm test:e2e`: run Playwright tests.
- `pnpm db:generate`: generate Drizzle migrations.
- `pnpm db:migrate`: apply Drizzle migrations.
- `pnpm db:studio`: open Drizzle Studio for DB inspection.

## Coding Style & Naming Conventions
- Language: TypeScript with `strict` mode enabled (`tsconfig.json`).
- Formatting pattern in this repo: 2-space indentation, no semicolons, double quotes.
- File naming: kebab-case for route/component files (example: `app/pr-preview/pr-preview-content.tsx`).
- Component naming: PascalCase exports; helpers/functions use camelCase.
- Use path alias `@/*` for internal imports when practical.

## Testing Guidelines
Testing uses:
- Vitest for unit tests (`tests/unit/**/*.test.ts`).
- Playwright for end-to-end tests (`tests/e2e/api-suite.spec.ts`).

Integration-style checks still live in `lib/e2e-tests.ts` and are exposed via:
- `GET /api/run-tests` for JSON test results.
- `app/test/` UI route for manual verification.

When adding behavior:
- Add/update unit tests in `tests/unit/` where possible.
- Add/update integration scenarios in `lib/e2e-tests.ts` when flow-level behavior changes.
- Validate with `pnpm test` locally.

Playwright supports:
- `TEST_BASE_URL`/`PLAYWRIGHT_BASE_URL` to target an existing running app.
- `TEST_PORT`/`PLAYWRIGHT_TEST_PORT` when Playwright launches `pnpm dev`.

## Commit & Pull Request Guidelines
Use Conventional Commit-style prefixes seen in history: `feat:`, `refactor:` (example: `feat: implement JWT and OAuth auth flow`).
- Keep commits focused and atomic.
- PRs should include: concise summary, affected routes/modules, test evidence (`pnpm lint`, `pnpm test`, and/or `/api/run-tests` output), and screenshots/GIFs for UI changes.
- Link related issues/tasks and note any new environment variables or migration steps.

## Deployment & Migrations
- Database schema changes must be managed through Drizzle migrations in `drizzle/`.
- Do not introduce manual SQL `ALTER TABLE` changes outside the Drizzle migration flow.
- Vercel build applies migrations before build (`vercel.json` uses `pnpm db:migrate && pnpm build`).

## Security & Configuration Tips
Keep secrets in `.env.local` (never commit them). Key variables used here include:
- `DATABASE_URL`, `SESSION_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_APP_SLUG` (for app-auth flows)
- `GITHUB_WEBHOOK_SECRET`
- `ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL` (optional base URL override)
