# Security & Open-Source Readiness Assessment

**Date:** 2026-02-26
**Scope:** Full codebase security review + open-source readiness evaluation

## Executive Summary

The codebase is well-secured and nearly ready for open-source release. No critical vulnerabilities or leaked secrets were found. The project demonstrates strong security practices across authentication, encryption, webhook verification, and input validation.

---

## 1. Secrets & Credential Scan

**Status: CLEAN**

| Check | Result |
|-------|--------|
| Hardcoded API keys/tokens | None found |
| `.env` files in repo | None (`.gitignore` excludes `.env*.local`) |
| Private keys / PEM files | None |
| Database credentials | Only placeholder/test values |
| Git history secrets | None ever committed or removed |
| CI test secrets | Clearly marked test values (`ci-integration-test-secret`) |

All secrets are properly externalized via `process.env.*`.

---

## 2. Security Analysis

### Strengths (25+ positive security controls)

- **Webhook signature verification** (`lib/github/webhook-signature.ts`): HMAC-SHA256 with `timingSafeEqual()`
- **Encryption at rest** (`lib/security/encryption.ts`): AES-256-GCM with random 12-byte IVs for OAuth tokens
- **JWT sessions** (`lib/auth.ts`): HTTP-only, Secure, SameSite=lax cookies with 30-day expiry via `jose`
- **OAuth CSRF protection**: Nonce-based state parameter validated against cookie
- **Open redirect prevention**: `sanitizeReturnTo()` rejects `//` protocol-relative URLs
- **SQL injection prevention**: All queries use Drizzle ORM parameterized queries
- **XSS prevention** (`components/markdown-renderer.tsx`): HTML escaped before markdown transform; links validated to `http/https/mailto` only
- **Input validation**: Zod schemas on all server actions and API inputs
- **CSP headers** (`next.config.mjs`): `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`
- **Additional security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- **Webhook idempotency**: Delivery deduplication via DB unique constraint
- **IP address privacy**: Hashed with HMAC-SHA256 before storage
- **Filename sanitization**: Download endpoint strips unsafe characters
- **Signature idempotency**: `onConflictDoNothing` prevents duplicate CLA signatures
- **User data DTO stripping**: `toSessionUserDto()` removes sensitive fields before client responses
- **Image domain whitelist**: Only `avatars.githubusercontent.com`, `github.com`, `api.dicebear.com`

### Medium Severity (1 item)

| # | Finding | Location | Details |
|---|---------|----------|---------|
| M1 | Key derivation uses raw SHA-256 instead of a proper KDF | `lib/security/encryption.ts:6` | Should use PBKDF2/scrypt for key stretching. If `ENCRYPTION_KEY` is a strong random value, risk is mitigated. |

### Low Severity (6 items)

| # | Finding | Location | Details |
|---|---------|----------|---------|
| L1 | Webhook verification skipped in dev | `app/api/webhook/github/route.ts` | Acceptable for dev mode. |
| L2 | Admin fallback to DB mapping in dev | `lib/server/org-access.ts:45-46` | Acceptable for dev mode. |
| L3 | CSP allows `unsafe-inline` for styles | `next.config.mjs:44` | Required for Tailwind CSS. |
| L4 | Debug logging exposes operational metadata | `app/api/orgs/route.ts`, `lib/github/admin-authorization.ts` | Not secrets, but noisy for production. |
| L5 | GET webhook endpoint exposed in dev | `app/api/webhook/github/route.ts:828` | Gated by `NODE_ENV`. |
| L6 | Hardcoded fallback URL | `lib/cla/signing.ts:225` | Should be configurable. |

### Recommendations

| # | Recommendation | Priority |
|---|---------------|----------|
| R1 | Rate limiting on OAuth callback and webhook endpoints | Medium |
| R2 | `npm audit` in CI pipeline for dependency vulnerability scanning | Medium |
| R3 | Session revocation mechanism (invalidate JTIs server-side) | Low |
| R4 | Explicit HSTS header | Low |

---

## 3. Open-Source Readiness

### Licensing

| Check | Status |
|-------|--------|
| LICENSE file | MIT -- excellent for open-source |
| Copyleft dependencies (GPL/AGPL) | None -- all deps are MIT/Apache/BSD |
| Copyright notice | Correct |
| Third-party code attribution | Clean |

### Action items before open-sourcing

| # | Issue | Severity |
|---|-------|----------|
| O1 | Make `fiveonefour.com` URLs configurable via env vars | Medium |
| O2 | Add `CONTRIBUTING.md` | Medium |
| O3 | Add `CODE_OF_CONDUCT.md` | Medium |
| O4 | Clean up debug `console.info` logging in production code paths | Low |
| O5 | Update Dependabot reviewer from individual to team | Low |
| O6 | Consider adding `npm audit` to CI | Low |

---

## 4. Verdict

### Is it secure?

**Yes, with caveats.** Strong security throughout -- webhook HMAC, AES-256-GCM encryption, JWT sessions, input validation, CSP headers. Document that `ENCRYPTION_KEY` must be a strong random value (32+ bytes).

### Is it open-sourceable?

**Yes, with minor cleanup.** No legal liabilities, no leaked secrets, no copyleft conflicts, no proprietary code concerns. Main work: make branded URLs configurable, add community docs.
