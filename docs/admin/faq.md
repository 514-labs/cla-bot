# Admin FAQ

## I can see the org but get "Access denied" in admin.
Your signed-in GitHub user may not have required permissions for that installation target. Verify org/admin rights and retry.

## Checks are not blocking merges. Why?
Ensure `CLA Bot / Contributor License Agreement` is required in branch protection/rulesets.

## A contributor signed, but checks didn't update immediately.
Check synchronization is async. Wait briefly and refresh checks. If needed, trigger `/recheck` per your process.

## Bypass entry isn't behaving as expected.
Confirm the actor was added in the correct bypass type (user vs app/bot), and verify slug formatting.

## What happens if the org is inactive?
When enforcement is inactive, CLA checks converge to passing and managed CLA prompt comments are cleared.
