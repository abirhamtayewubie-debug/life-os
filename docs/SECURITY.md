# Security review (Phase 8)

Reviewed 2026-10-22 against the code on `main` plus this phase's changes. This is a self-review by the person who built the app, backed by automated tests. It is not an independent audit or penetration test.

## What protects the data

| Area | How | Checked by |
|---|---|---|
| Isolation between people | Row Level Security, enabled and forced, on every table; policies key on `auth.uid()`; child rows reference parents by `(id, user_id)` | `supabase/tests/*.sql` (all phases), plus "a second user sees nothing" in the Playwright flows |
| Secrets | Only the Supabase URL and publishable key reach the browser. The Anthropic key is read on the server only. The service-role key is not used anywhere | `grep` in review; `.env.example` documents which values are public |
| Writes | Server Actions validate input with zod and use the signed-in person's own database session | Unit and e2e tests per module |
| AI assistant | No database credentials; reads through the person's session; changes are suggestions that need a tap to confirm; per-area sharing; budget and rate limit | `tests/unit/assistant.test.ts`, `supabase/tests/assistant.sql`, `tests/e2e/assistant.spec.ts` |
| Browser hardening | Per-request nonce Content-Security-Policy (`strict-dynamic`, no inline or injected scripts), `frame-ancestors 'none'`, X-Frame-Options, nosniff, HSTS, COOP, strict referrer and permissions policies | `tests/e2e/account.spec.ts` |
| Account deletion | `delete_my_account()` deletes only `auth.uid()`, takes no arguments, and cascades to every table; the app asks for the password again and a typed phrase | `supabase/tests/account.sql`, `tests/e2e/account.spec.ts` |
| Export | Read through the person's session, with an explicit owner filter; integration secrets are excluded; downloads are `no-store` and audited | `tests/e2e/account.spec.ts` |
| Sign-in | Same message for unknown email and wrong password; Supabase Auth rate limits; passwords of at least 10 characters | `tests/e2e/foundation.spec.ts` |
| Dependencies | `npm audit --omit=dev`: 0 known vulnerabilities on 2026-10-22 | Run again before each release |

## Changed in this phase

- Replaced the static header-only CSP with a nonce-based policy from `src/proxy.ts`; the theme script receives the nonce. Development keeps `'unsafe-eval'` (React needs it there); production does not.
- Added HSTS and Cross-Origin-Opener-Policy.
- Added data export and self-service account deletion.
- Added `/healthz`, which reads only the public currency list.

## Known limits and follow-ups

- **Inline styles are allowed** (`style-src 'unsafe-inline'`) because charts and some components set style attributes. Styles can't run scripts, so the remaining risk is limited to layout tampering.
- **Sign-in rate limiting is per IP at Supabase.** Because sign-in requests come from the app server, all users share that limit. Fine for a personal app. If more people use it, add an app-level limit keyed by email, or move sign-in to the browser client.
- **No multi-factor authentication yet.** Supabase supports TOTP; adding it is a contained change.
- **Backups on the Free plan are your exports.** See DEPLOYMENT.md.
- **Integration tokens (Phase 7)** must be encrypted with Supabase Vault before any integration is connected. The table is already unreadable to signed-in users.
- **Not done:** an independent penetration test, and automated dependency updates (for example Dependabot), which needs a repository setting.
