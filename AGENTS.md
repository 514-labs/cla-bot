# Repository Guidelines

## Project Structure & Module Organization
This repo is a Next.js 16 + TypeScript app-router project.
- `app/`: routes, pages, layouts, and API handlers (`app/api/**/route.ts`).
- `components/`: shared UI and feature components (`components/ui/*` for design-system primitives).
- `lib/`: core logic (auth, GitHub client wrappers, database queries/schema, test harness).
- `hooks/`: reusable React hooks.
- `public/`: static assets.
- `scripts/`: SQL helpers for schema/migration support.
- `styles/` and `app/globals.css`: global styling.

## Build, Test, and Development Commands
Use `pnpm` (lockfile is `pnpm-lock.yaml`).
- `pnpm dev`: start local dev server.
- `pnpm build`: production build (includes TypeScript checks).
- `pnpm start`: run production server from build output.
- `pnpm lint`: run ESLint across the repo.
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
There is no `pnpm test` script currently. Integration-style checks live in `lib/e2e-tests.ts` and are exposed via:
- `GET /api/run-tests` for JSON test results.
- `app/test/` UI route for manual verification.

When adding behavior, include or update an end-to-end scenario in `lib/e2e-tests.ts` and verify locally (example: `curl http://localhost:3000/api/run-tests` while `pnpm dev` is running).

## Commit & Pull Request Guidelines
Use Conventional Commit-style prefixes seen in history: `feat:`, `refactor:` (example: `feat: implement JWT and OAuth auth flow`).
- Keep commits focused and atomic.
- PRs should include: concise summary, affected routes/modules, test evidence (`/api/run-tests` output or `pnpm lint`), and screenshots/GIFs for UI changes.
- Link related issues/tasks and note any new environment variables or migration steps.

## Security & Configuration Tips
Keep secrets in `.env.local` (never commit them). Key variables used here include:
- `DATABASE_URL`, `SESSION_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` (for app-auth flows)
- `NEXT_PUBLIC_APP_URL` (optional base URL override)
