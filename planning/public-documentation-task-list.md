# Public Documentation Execution Task List

This checklist translates the documentation plan into concrete implementation work based on the current codebase.

## 0) Foundation / Docs Infrastructure
- [x] Create `docs/index.md` as the public documentation entry page with 3 clear paths:
  - Contributor (`cla.fiveonefour.com`)
  - Admin (`cla.fiveonefour.com`)
  - Operator (self-hosting)
- [x] Add a "Documentation" section in `README.md` linking to `docs/index.md` and the three tracks.
- [ ] Define a reusable page template for all docs pages:
  - Purpose
  - Prerequisites
  - Steps
  - Expected result
  - Troubleshooting
  - Related links
- [ ] Decide docs validation command(s) and add to CI/checklist (markdown lint + link check).

## 1) Contributor Track (Repo Contributor)

### 1.1 Signing a CLA
- [x] Create `docs/contributor/signing-a-cla.md`.
- [x] Document auth and sign flow using current route behavior:
  - Sign-in entry: `/auth/signin`
  - Sign page: `/sign/[orgSlug]`
  - Signing API: `POST /api/sign/[orgSlug]`
- [x] Explain special query params (`repo`, `pr`) used during PR-driven signing links.
- [ ] Add UI callouts for:
  - sign-in required state
  - scroll-to-bottom before sign enabled
  - signed/re-sign required states

### 1.2 See all CLAs I signed
- [x] Create `docs/contributor/signed-cla-history.md`.
- [x] Document `/contributor` dashboard behavior:
  - latest vs historical signatures
  - re-sign warning states
  - current vs outdated version badges

### 1.3 Download CLA
- [x] Create `docs/contributor/download-a-cla.md`.
- [x] Document download flow and permissions using:
  - `GET /api/contributor/signatures/[signatureId]/download`
- [x] Add common error handling guidance (not signed in, unauthorized signature ID).

### 1.4 Contributor FAQ
- [x] Create `docs/contributor/faq.md`.
- [x] Add answers for common issues:
  - "Why is my PR still failing after I signed?"
  - "Why do I need to re-sign?"
  - "I signed for one org; why not another?"

## 2) Admin Track (Repo Admin)

### 2.1 Setup CLA Bot with my org
- [x] Create `docs/admin/setup-cla-bot-with-my-org.md`.
- [x] Document installation + first-time setup flow:
  - Install entry: `/api/github/install`
  - Admin list page: `/admin`
  - Org manage page: `/admin/[orgSlug]`
- [x] Include branch protection requirement for `CLA Bot / Contributor License Agreement`.
- [x] Provide "first 15 minutes" checklist for successful rollout.

### 2.2 Manage the installation
- [x] Create `docs/admin/manage-installation.md`.
- [x] Document org manage tabs and operations:
  - CLA edit/save and versioning
  - active/inactive enforcement toggle
  - signer history and archives
  - bypass user/app management
- [x] Document expected async behavior after config changes (open PR rechecks).

### 2.3 Admin FAQ
- [x] Create `docs/admin/faq.md`.
- [x] Add admin troubleshooting topics:
  - installation visible but access denied
  - checks not blocking merges
  - webhook delivery/signature issues
  - bypass actors not matching expected usernames/bots

## 3) Operator Track

### 3.1 Deploy this on my infrastructure
- [x] Create `docs/operator/deploy-on-my-infrastructure.md`.
- [x] Document production prerequisites from `README.md`:
  - Node.js, pnpm, PostgreSQL
  - required environment variables
  - migrations and startup commands
- [x] Include deployment shape and migration behavior (`vercel.json`, Drizzle migration flow).
- [x] Add sections for:
  - health checks and logs to inspect
  - webhook reliability + delivery dedupe
  - backup/restore considerations for Postgres

### 3.2 Operator Runbook / Troubleshooting
- [x] Create `docs/operator/runbook.md` (or an operator troubleshooting section).
- [x] Provide symptom → cause → fix tables for:
  - failing webhook signature validation
  - OAuth callback failures
  - stale CLA checks not updating
  - DB connectivity/migration failures

## 4) Source-of-Truth Alignment Tasks
- [ ] For every docs claim, verify against `SPEC.md` before merge.
- [ ] Cross-check behavioral examples against:
  - `tests/integration/api-suite.test.ts`
  - `tests/e2e/pages-reference.spec.ts`
- [ ] Ensure route names and parameter examples match actual App Router files in `app/`.

## 5) Release / Governance Tasks
- [ ] Add a PR checklist item: "Docs updated for behavior/config/route changes."
- [ ] Add docs ownership (maintainer rotation or codeowners for `docs/**`).
- [ ] Publish docs changelog policy and review cadence (quarterly drift audit).

## Suggested Build Order (Execution Sequence)
1. Docs landing + README docs links
2. Contributor pages + FAQ
3. Admin pages + FAQ
4. Operator deployment + runbook
5. Verification pass against `SPEC.md` + tests + link/lint checks

## Definition of Execution Complete
- [x] All three tracks exist and are linked from docs landing.
- [x] Requested pages exist:
  - Contributor: signing, signed-history, download, FAQ
  - Admin: setup, manage installation, FAQ
  - Operator: deploy on my infrastructure
- [x] README links to docs.
- [ ] Docs reviewed for accuracy against current implementation.
