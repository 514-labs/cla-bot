# Manage the Installation (Admin)

## Purpose
Operate CLA Bot after initial setup for an organization.

## Main route
- `/admin/[orgSlug]`

## Manage tabs
Supported tabs are controlled by `?tab=`:
- `cla` — edit/save CLA text (new text creates a new version hash)
- `signers` — view signer records
- `archives` — view/download historical CLA versions
- `bypass` — manage bypass users/apps/bots

## Common operations
1. **Update CLA text**
   - Save in the `cla` tab.
   - Contributors with older signatures must re-sign.
2. **Toggle active/inactive enforcement**
   - Use activation control in the org manage UI.
3. **Manage bypass list**
   - Add/remove bypass actors for users and app/bot slugs.

## After configuration changes
CLA Bot schedules async rechecks of relevant open PRs so status/comments converge with current policy.

## Related
- [Setup CLA Bot with my org](/docs/admin/setup-cla-bot-with-my-org)
- [Admin FAQ](/docs/admin/faq)
