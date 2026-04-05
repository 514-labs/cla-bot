# Setup CLA Bot with My Org (Admin)

## Purpose
Install CLA Bot for your organization and configure initial CLA enforcement.

## Prerequisites
- You are signed in with GitHub.
- You are allowed to administer the organization installation.

## Setup Steps
1. Start installation from `/api/github/install`.
2. Open `/admin` to verify your org appears.
3. Open `/admin/[orgSlug]` for your organization.
4. In the **CLA** tab, add CLA text and save.
5. Activate enforcement for the org.
6. Copy/share the signing link for contributors (`/sign/[orgSlug]`).

## Required GitHub branch protection
To block merges for non-compliant PRs, require this status check in branch protection/rulesets:
- `CLA Bot / Contributor License Agreement`

## First 15-minute validation checklist
- Installation visible in `/admin`
- CLA text saved in `/admin/[orgSlug]?tab=cla`
- Enforcement active
- Required status check configured in GitHub
- Signing URL tested by a non-member account

## Related
- [Manage the installation](/docs/admin/manage-installation)
- [Admin FAQ](/docs/admin/faq)
