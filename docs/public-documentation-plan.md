# Public Documentation Plan

## Goal
Publish clear, versioned, publicly accessible documentation for CLA Bot with **three primary documentation tracks**:
1. Repo Contributor (`cla.fiveonefour.com`)
2. Repo Admin (`cla.fiveonefour.com`)
3. Operator (self-hosting/deployment)

## Main Sections (Requested Structure)

### 1) Repo Contributor (`cla.fiveonefour.com`)
- Signing a CLA
- See all CLAs I signed
  - Download CLA
- FAQ

### 2) Repo Admin (`cla.fiveonefour.com`)
- Setup CLA Bot with my org
- Manage the installation
- FAQ

### 3) Operator
- Deploy CLA Bot on my infrastructure

## Execution Artifact
- Detailed implementation checklist: `docs/public-documentation-task-list.md`

## Success Criteria
- The public docs homepage clearly routes users into one of the three tracks above.
- A contributor can sign and download prior agreements without external help.
- An admin can install, configure, and operate CLA Bot for an org.
- An operator can deploy and run CLA Bot in their own environment.
- Docs stay aligned with product behavior in `SPEC.md` and setup details in `README.md`.

## Proposed Documentation IA

### Docs Landing
- `docs/index.md`
  - "I am a Contributor"
  - "I am an Admin"
  - "I am an Operator"

### Contributor Track
- `docs/contributor/signing-a-cla.md`
- `docs/contributor/signed-cla-history.md`
- `docs/contributor/download-a-cla.md`
- `docs/contributor/faq.md`

### Admin Track
- `docs/admin/setup-cla-bot-with-my-org.md`
- `docs/admin/manage-installation.md`
- `docs/admin/faq.md`

### Operator Track
- `docs/operator/deploy-on-my-infrastructure.md`

## Content Source Mapping
- `README.md` for installation commands, env vars, and local/dev workflows.
- `SPEC.md` for route-level behavior, webhook outcomes, and enforcement expectations.
- `tests/integration/api-suite.test.ts` and `tests/e2e/pages-reference.spec.ts` for executable behavior references.

## Execution Plan

### Phase 1 — Structure & Navigation
- Create the three top-level docs tracks (Contributor/Admin/Operator).
- Add explicit track links on docs landing and from `README.md`.
- Set a shared template for task pages (Goal, Steps, Expected Result, Troubleshooting, FAQ link).

### Phase 2 — Contributor Docs
- Publish signer journey docs:
  - Sign a CLA
  - View all signed CLAs
  - Download a CLA
- Add contributor FAQ with top signer issues (auth, outdated signature, re-sign prompts).

### Phase 3 — Admin Docs
- Publish admin onboarding docs:
  - Setup CLA Bot with my org
  - Manage installation and ongoing configuration
- Add admin FAQ (permissions, branch protection, bypass list, inactive org behavior).

### Phase 4 — Operator Docs
- Publish deployment guide for self-hosted infrastructure:
  - prerequisites
  - environment variables
  - database migrations
  - production run/deploy checklist
  - operational checks and troubleshooting

### Phase 5 — Review & Publish
- Validate docs against current `SPEC.md` and `README.md`.
- Run markdown/link checks.
- Announce docs entry points in README and release notes.

## Quality Gates
- Each page maps to one user task and includes clear expected outcomes.
- Behavioral claims reference current app behavior (no speculative docs).
- Internal links are valid and contributor/admin/operator paths are discoverable in ≤2 clicks.
- At least one maintainer dry-runs each track end-to-end.

## Definition of Done
- Three main sections exist exactly as requested: Contributor, Admin, Operator.
- Contributor track includes sign, history, download, and FAQ content.
- Admin track includes setup, manage installation, and FAQ content.
- Operator track includes deployment to own infrastructure.
- Docs are linked from the repo entry points and are ready for public consumption.
