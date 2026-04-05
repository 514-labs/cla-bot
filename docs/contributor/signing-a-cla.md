# Signing a CLA (Contributor)

## Purpose
Sign or re-sign an organization's current Contributor License Agreement so CLA checks pass on your pull requests.

## Prerequisites
- You have a GitHub account.
- The repository uses CLA Bot.
- You can access the sign URL: `/sign/[orgSlug]`.

## Steps
1. Go to the organization's sign page (usually from a PR comment link).
2. If prompted, sign in via GitHub.
   - Sign-in entry route: `/auth/signin`
   - OAuth start endpoint: `/api/auth/github`
3. Review the CLA text and scroll to the end.
4. Click **Sign CLA**.
5. Wait for confirmation.

## PR-linked signing
Some links include `repo` and `pr` query parameters (for example: `/sign/my-org?repo=my-repo&pr=42`).
These parameters let CLA Bot target the relevant PR when updating CLA status after signing.

## Expected Result
- Your signature is recorded using `POST /api/sign/[orgSlug]`.
- If your PR was blocked for missing/outdated CLA, CLA Bot schedules PR check synchronization.

## Troubleshooting
- **"Sign in required" appears**: authenticate first with GitHub.
- **Button not enabled**: continue scrolling until the end of the CLA.
- **PR still failing immediately after signing**: wait for async check sync, then refresh PR checks.

## Related
- [See all CLAs I signed](./signed-cla-history.md)
- [Download a CLA](./download-a-cla.md)
- [Contributor FAQ](./faq.md)
