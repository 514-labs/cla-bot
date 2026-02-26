# Repository Guidelines

## Canonical References
- Product behavior and route/spec details live in `SPEC.md` (`Page Spec`, `Scenario Catalog`, and `System Behavior Spec` sections).
- Local setup, required environment variables, and command usage live in `README.md`.

## Project Structure & Module Organization
This repo is a Next.js 16 + TypeScript app-router project.
- `app/`: routes, pages, layouts, and API handlers (`app/api/**/route.ts`).
- `components/`: shared UI and feature components (`components/ui/*` for design-system primitives).
- `lib/`: core logic (auth, GitHub client wrappers, database queries/schema).
- `hooks/`: reusable React hooks.
- `public/`: static assets.
- `drizzle/`: generated Drizzle SQL migrations and metadata.
- `tests/`: test suites (`tests/unit/*` for Vitest unit tests, `tests/integration/*` for Vitest API integration tests, `tests/e2e/*` for Playwright UI tests).
- `styles/` and `app/globals.css`: global styling.

## Coding Style & Naming Conventions
- Language: TypeScript with `strict` mode enabled (`tsconfig.json`).
- Formatting pattern in this repo: 2-space indentation, no semicolons, double quotes.
- File naming: kebab-case for route/component files (example: `app/auth/signin/page.tsx`).
- Component naming: PascalCase exports; helpers/functions use camelCase.
- Use path alias `@/*` for internal imports when practical.

## Testing Guidelines
When adding behavior:
- Add/update unit tests in `tests/unit/` where possible.
- Add/update API integration scenarios in `tests/integration/api-suite.test.ts` and supporting helpers in `tests/utils/` when flow-level behavior changes.
- Add/update browser/page checks in `tests/e2e/pages-reference.spec.ts` when UI behavior changes.
- Validate with `pnpm test` locally (see `README.md` command table).

## Commit & Pull Request Guidelines
Use Conventional Commit-style prefixes seen in history: `feat:`, `refactor:` (example: `feat: implement JWT and OAuth auth flow`).
- Keep commits focused and atomic.
- PRs should include: concise summary, affected routes/modules, test evidence (`pnpm lint`, `pnpm test`), and screenshots/GIFs for UI changes.
- Link related issues/tasks and note any new environment variables or migration steps.

## Deployment & Migrations
- Database schema changes must be managed through Drizzle migrations in `drizzle/`.
- Do not introduce manual SQL `ALTER TABLE` changes outside the Drizzle migration flow.
- Vercel build applies migrations before build (`vercel.json` uses `pnpm db:migrate && pnpm build`).
