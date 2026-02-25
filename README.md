# CLA Bot

CLA Bot is a Next.js app that automates Contributor License Agreement (CLA) workflows for GitHub organizations and personal accounts.

It gives org admins a place to manage CLA text and signing history, and gives contributors a place to review/sign/re-sign agreements. A GitHub webhook handler enforces CLA status on pull requests by creating checks/comments.

## Product Requirements (Authoritative)

- If a contributor has signed a non-current CLA version, they must re-sign before being considered compliant.
- Contributor compliance status is evaluated per org using the contributor's latest signed version for that org.
- Admins can define an org-scoped bypass list of GitHub accounts that should always receive a passing CLA check.
- If a contributor has open pull requests and their signature becomes outdated after a CLA update, checks may need to be re-opened/re-evaluated and set to failing until re-signing is completed.
- After a contributor signs/re-signs the latest CLA, the app schedules an async workflow that updates their open PR CLA checks to success and removes stale CLA prompt comments.
- GitHub is the user-management source of truth for the app.
- The app has no local signup/password user-management system; DB user rows are GitHub-linked identity mirrors only.
- Authentication/session management is stateless JWT-based (HTTP-only cookie + signed JWT with `jti`).
- Users can only log in via GitHub OAuth.
- Contributors can view and download every CLA version they have signed.
- Admins can download both current and archived CLA versions for managed orgs.

## What The App Is For

- Keep legal contributor agreements tied to each installed GitHub account.
- Automatically block/allow PRs based on CLA status.
- Reduce maintainer overhead by automating "please sign the CLA" comments/checks.
- Let contributors re-sign when CLA text changes (versioned by SHA-256 hash).

## Requirements (Local Dev)

- Node.js `>=20` (recommended: latest LTS)
- `pnpm`
- Postgres database (Neon or compatible) reachable via `DATABASE_URL`

Required environment variables (minimum to run app + local test auth):

- `DATABASE_URL`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`

Environment variables for full GitHub OAuth + App installation flows:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_SLUG`
- `GITHUB_WEBHOOK_SECRET` (for signed webhook validation)
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` (for real GitHub App API calls)

Optional:

- `NEXT_PUBLIC_APP_URL`
- `SEED_DATABASE=true` to auto-seed local data on startup
- `DRIZZLE_MIGRATIONS_SCHEMA` (default: `drizzle`)
- `DRIZZLE_MIGRATIONS_TABLE` (default: `__drizzle_migrations`)

For browser UI tests, install Playwright browsers once:

```bash
pnpm exec playwright install chromium
```

If you set custom migration metadata location, configure the same values in both build and runtime environments.

## Dev Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local` with required variables.

3. Apply DB migrations:

```bash
pnpm db:migrate
```

4. Start the app:

```bash
pnpm dev
```

## Lifecycle Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start local dev server |
| `pnpm build` | Production build + TypeScript checks |
| `pnpm start` | Run built app |
| `pnpm lint` | Biome checks |
| `pnpm test` | Run unit + integration tests (fast default) |
| `pnpm test:all` | Run unit + integration + browser e2e tests |
| `pnpm test:unit` | Run Vitest unit tests |
| `pnpm test:integration` | Run Vitest API integration suite |
| `pnpm test:e2e` | Run Playwright browser/page tests |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Page Spec (Reference)

This section is the behavior contract for UI routes.

| Route | Purpose | Signed-out behavior | Signed-in behavior | Key actions |
| --- | --- | --- | --- | --- |
| `/` | Marketing landing page | Public page | Same | CTA to `/auth/signin`, example CLA link to `/sign/fiveonefour` |
| `/auth/signin` | Start sign-in flow | Shows GitHub sign-in CTA | Same | Sends user to `/api/auth/github?returnTo=...`; `returnTo` is sanitized to internal paths only |
| `/dashboard` | Mode selector page | Public page | Same + session shown in header | Navigate to `/admin` or `/contributor` |
| `/admin` | Org admin overview | Shows "Sign in required" card | Lists organizations user can administer; shows install CTA when none are authorized | Install app (`/api/github/install`), open org manage pages |
| `/admin/[orgSlug]` | Org CLA management | If data unavailable, shows "Organization not found" UI | Shows org details, CLA version, signers, archives, bypass list, branch-protection reminder | Edit/save CLA text, activate/deactivate bot, copy signing link, inspect signers/archives, manage bypass usernames, download current/archived CLA text |
| `/contributor` | Contributor agreement dashboard | Shows "Sign in required" card | Lists signed CLA history grouped by org status | Re-sign prompts for outdated orgs, links to `/sign/[orgSlug]`, download previously signed CLA records |
| `/sign/[orgSlug]` | CLA read/sign page | Shows sign-in required (or org not found) | Shows signed state, or sign/re-sign workflow | Requires scroll-to-bottom before sign button enables; handles inactive org warning |
| `/terms` | Legal terms page | Public page | Same | Documents signing/enforcement terms and branch-protection requirement |
| `/privacy` | Privacy policy page | Public page | Same | Documents collected data, retention, and rights workflow |

## Scenario Catalog (Amended + Expanded)

This section amends your scenario list and adds missing scenarios.

### 1) First login with the app

- Users can only authenticate via GitHub OAuth.
- OAuth flow validates `state` and redirects back to a sanitized internal `returnTo`.
- Session is maintained with an HTTP-only cookie containing a JWT payload (`userId`, `githubUsername`, `role`, `jti`).
- GitHub remains the source of truth for identity. The DB stores app-side profile/session linkage metadata, not standalone account management.

### 2) User selects Admin

- If signed out: user sees auth-required state and can start GitHub login.
- If signed in and authorized on at least one installed account: user sees the account list and install button.
- If signed in but authorized on zero installed accounts: user sees install CTA for GitHub App flow.
- Newly installed accounts start with no CLA text. Maintainers must publish their own CLA before external contributors can sign.

### 3) User selects Contributor

- User sees signed CLA records including org, version label/hash prefix, and signed timestamp.
- User can view full signing history and download each signed record they own.
- Org compliance status uses the latest signature per org; older historical rows do not keep an org in a warning state once the latest version is signed.
- User can open a CLA from the list and view full language on `/sign/[orgSlug]`.
- Data detail: full SHA-256 hash is persisted in DB; UI currently shows the short 7-character version label.

### 4) Admin creates a new CLA version

- Saving CLA updates current text/hash.
- Existing signatures remain historical; users on previous hash are treated as outdated and must re-sign.
- If no one has signed prior versions, only current hash/text changes.
- If prior versions were signed, historical signed versions remain in archives/signatures.
- Saving CLA schedules an async workflow recheck of open pull requests; non-member contributors with missing/outdated signatures receive failing checks and updated signing comments once the workflow run completes.

### 5) Contributor opens a PR

- Org member: check passes, no CLA comment.
- Personal-account repository owner: check passes, no CLA comment.
- User on org bypass list: check passes, no CLA comment.
- Non-member + current signature: check passes, no CLA comment.
- Non-member + outdated signature: check fails, re-sign comment posted.
- Non-member + never signed: check fails, sign prompt comment posted.

### 6) Contributor signs/re-signs CLA

- Signature is stored with org, user, full CLA hash, accepted hash, assent metadata, immutable GitHub ID at signing time, timestamp, email provenance, and session evidence fields.
- If `repo` + `pr` is provided, the signer must match that PR author before targeted PR sync is applied.
- After signing/re-signing, the app schedules an async workflow to sync open PRs authored by that contributor in the org: latest CLA check runs are updated to success and stale CLA prompt comments are deleted.

### 7) Signed CLA versions cannot be deleted

- There is no route to delete signed CLA archives/signature history.
- Signed version history behaves as append-only.

### 8) CLA downloads

- Contributors can download CLA versions from their own signing history.
- Admins can download both current and archived CLA versions for orgs they administer.
- Download endpoints enforce ownership/authorization and do not expose records across users/orgs.

### 9) Additional scenarios commonly missed

- Org deactivated/uninstalled: signing blocked, webhook checks/comments skipped.
- Updating bypass list schedules async open-PR recheck so existing PRs converge to the latest policy.
- `/recheck` authorization: allowed for PR author, org member, or maintainer; unauthorized users are blocked.
- OAuth and install redirects sanitize `returnTo` to prevent open redirects.
- Webhook hardening: production signature verification and delivery de-duplication.
- Standard error paths: unauthorized, forbidden, missing org, invalid payload combinations.

### 10) OAuth/session lifecycle edge cases

- OAuth callback state mismatch/expired state cookie: sign-in fails safely and redirects back to `/auth/signin?error=...`.
- GitHub token exchange or profile fetch failure: sign-in fails safely and no session cookie is issued.
- Explicit logout clears JWT cookie; expired/invalid JWT is treated as signed-out.

### 11) `/recheck` command behavior edge cases

- `/recheck` is only processed on PR issue comments; non-PR issue comments are ignored.
- Non-command comments (or non-created comment events) are ignored.
- If PR head SHA cannot be resolved in production, `/recheck` fails with an error instead of guessing.

### 12) Webhook delivery/idempotency scenarios

- Duplicate `x-github-delivery` IDs are ignored via persistent DB-backed delivery tracking to reduce duplicate check/comment churn across process restarts.
- Missing/invalid webhook signature is rejected in production when `GITHUB_WEBHOOK_SECRET` is configured.
- Missing required payload fields return `400` and do not mutate DB/check state.

### 13) Installation lifecycle scenarios

- Installation `created` or `unsuspend`: account row is created/reactivated, installation ID refreshed, and installation target metadata (`organization` vs `user`) is persisted.
- New installations are initialized with empty CLA text and `cla_text_sha256 = null` (no built-in agreement/template is auto-published).
- Installation `deleted` or `suspend`: account is deactivated and installation ID cleared.
- Installation repository-change events refresh installation linkage.

### 14) Access-control scenarios

- In production, org installs require live GitHub org-admin verification.
- In production, personal-account installs are authorized when the signed-in GitHub user matches the installation target account.
- In local dev/test, org-admin verification is relaxed to keep tests deterministic.
- `/admin/[orgSlug]` and `/sign/[orgSlug]` handle unknown orgs with explicit not-found states.

## System Behavior Spec (PR/Webhook Flow)

- Pull request webhook checks whether PR author is an org member or has signed current CLA.
- PR signature resolution is keyed by immutable GitHub user ID when available (username is fallback only).
- Contributor dashboard status uses the latest stored signature per org to determine current/outdated state in UI.
- Outcomes:
  - Org member: passing check, no CLA comment.
  - Bypass-listed account: passing check, no CLA comment.
  - Signed current CLA: passing check, no CLA comment.
  - Unsigned/outdated signature: failing check + bot comment with signing URL.
- When CLA text changes, contributors on older signatures are marked as requiring re-sign; open PRs may require check re-evaluation and failure until re-signing.
- After signing/re-signing, an async workflow updates signer-authored open PR CLA checks to success and removes stale CLA prompt comments.
- Repository maintainers must require `CLA Bot / Contributor License Agreement` in GitHub branch protection/rulesets for merge blocking to be enforced.

## End-to-End Test Coverage Around This Spec

Reference UI coverage:

- `tests/e2e/pages-reference.spec.ts`
  - `home and dashboard pages render core navigation`
  - `sign-in page sanitizes external returnTo`
  - `admin page shows auth-gated state when signed out`
  - `admin list and org detail pages render for signed-in admin`
  - `contributor page shows auth-gated state when signed out`
  - `contributor page shows signed agreements when signed in`
  - `sign page handles auth-gated and not-found states`
  - `sign page supports re-sign flow after CLA update`

Reference API/flow coverage:

- `tests/integration/api-suite.test.ts`
  - Broad integration flow coverage for auth/session APIs, org management, signing/re-signing, webhook checks/comments, install/uninstall/suspend lifecycle, and `/recheck` authorization.
  - Includes edge cases like stale-signature detection after CLA updates, `/recheck` handling/authorization on open PRs, malformed webhook payload rejection, and duplicate webhook delivery de-duplication.

## Keeping Spec And Tests In Sync

When behavior changes:

1. Update this README page/spec sections.
2. Update or add coverage in `tests/integration/api-suite.test.ts` and/or `tests/e2e/pages-reference.spec.ts` as appropriate.
3. Run `pnpm test` and `pnpm build` before merging. Run `pnpm test:all` when UI/browser behavior changes.
