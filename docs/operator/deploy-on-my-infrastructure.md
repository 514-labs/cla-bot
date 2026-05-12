# Deploy CLA Bot on My Infrastructure (Operator)

## Purpose
Run CLA Bot in your own infrastructure with production-ready configuration.

## Prerequisites
- Node.js >= 20
- pnpm
- PostgreSQL
- A GitHub App with user authorization enabled and "Expire user authorization tokens" turned on (provides both the user-OAuth and installation credentials)

## Required environment variables
- `DATABASE_URL`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`

## Deployment steps
1. Install dependencies: `pnpm install`
2. Configure environment variables (for example in `.env.local` or your secret manager).
3. Apply migrations: `pnpm db:migrate`
4. Build: `pnpm build`
5. Run: `pnpm start`

## Notes on migrations
Use Drizzle migrations in `drizzle/`. Do not apply ad hoc manual schema edits outside the migration flow.

## Operational checks
- Verify webhook deliveries reach `/api/webhook/github`.
- Verify OAuth login and callback complete successfully.
- Verify CLA checks are created/updated on PR events.
- Monitor logs for webhook signature validation and DB errors.

## Troubleshooting quick table
| Symptom | Likely cause | Action |
| --- | --- | --- |
| Webhook requests rejected | Signature mismatch or wrong secret | Verify `GITHUB_WEBHOOK_SECRET` and GitHub webhook settings |
| OAuth sign-in fails | Invalid GitHub App user-OAuth credentials, or "Expire user authorization tokens" disabled | Re-check `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and confirm the App's token-expiry setting |
| PR checks stale after signing | Async sync backlog/transient failure | Retry after short wait; inspect webhook and app logs |
| App boot fails on deploy | DB unreachable or migrations pending | Validate `DATABASE_URL`, run `pnpm db:migrate`, retry |

## Related
- [Documentation Home](/docs)
