# Download a CLA

## Purpose
Download a CLA version from your personal signing history.

## Endpoint
- `GET /api/contributor/signatures/[signatureId]/download`

## Steps
1. Open `/contributor`.
2. Find the signature you want to download.
3. Click the download action for that record.
4. Save the file locally.

## Access rules
- You must be signed in.
- You can only download signature records you own.

## Troubleshooting
- **401/Sign in required**: authenticate via GitHub and try again.
- **403/Forbidden**: the signature ID does not belong to your account.
- **404/Not found**: the signature record does not exist.

## Related
- [See all CLAs I signed](./signed-cla-history.md)
- [Contributor FAQ](./faq.md)
