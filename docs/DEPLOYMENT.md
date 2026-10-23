# Deployment, backups and monitoring

Status: **written, not yet carried out.** No hosting or database accounts have been created for this project. Each step that creates an account or may cost money needs Ab's approval first. Everything below has been checked against the local stack only.

## What you need

| Service | Plan to start with | Cost | Used for |
|---|---|---|---|
| Supabase | Free | $0 (pauses after a week without activity; Pro is $25/month) | Postgres, Auth, daily backups |
| Vercel | Hobby | $0 for personal, non-commercial use | Hosting the Next.js app |
| Anthropic | Pay as you go | Usage-billed; optional | The AI assistant only. The app runs fully without it |

Notifications on devices use the browsers' own push services (Google, Apple, Mozilla, Microsoft), which need no account and cost nothing.

Prices are as published by each provider; check their pricing pages before signing up.

## 1. Database (Supabase)

1. Create a project. Pick the region closest to you (for Addis Ababa, `eu-central-1` Frankfurt is usually the lowest latency). Save the database password in a password manager.
2. Apply the schema from this repository:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push            # applies every file in supabase/migrations, in order
   ```
3. Auth settings (Dashboard → Authentication):
   - **URL configuration:** Site URL = your app URL; add `<app-url>/auth/callback` to the redirect allow-list.
   - **Email:** keep "Confirm email" on. Supabase's built-in email sender is limited to a few messages an hour; add your own SMTP before inviting anyone else.
   - **Email template (Authentication → Emails → Confirm signup):** change the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. The default link only finishes signing in if it's opened in the same browser that signed up; this one works anywhere (on a phone, in another browser).
   - **Email template (Authentication → Emails → Reset password):** change the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`, so a reset link also works in any browser and goes straight to choosing a new password.
   - **Password:** minimum length 10 (the app already requires 10).
   - **Rate limits:** the defaults (30 sign-in/sign-up attempts per 5 minutes per IP) are enough for one person. Note that sign-in calls come from the app's server, so on Vercel they share that server's addresses.
4. The secret (service-role) key bypasses Row Level Security. The app uses it in exactly one place: the reminder sender at `/api/cron/reminders`, which has to see everyone's due reminders and only runs when called with `CRON_SECRET`. Put it in the Vercel environment as `SUPABASE_SECRET_KEY` and nowhere else; never in a `NEXT_PUBLIC_` variable.

## 2. App (Vercel)

1. Import the GitHub repository `abirhamtayewubie-debug/life-os`.
2. Environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Supabase → Project Settings → API.
   - `NEXT_PUBLIC_SITE_URL` = the production URL.
   - `ANTHROPIC_API_KEY` only if you want the assistant. Set a monthly spend limit in the Anthropic console first.
   - Notifications on devices: generate a key pair once with `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public), `VAPID_PRIVATE_KEY` (secret) and `VAPID_SUBJECT` (`mailto:` your address; push services use it to contact you about problems). Changing the pair later turns notifications off on every device until each is turned on again.
   - Reminder sender: `CRON_SECRET` (32 or more random characters, for example `openssl rand -base64 36`) and `SUPABASE_SECRET_KEY` (see step 1.4).
   - Never set `PUSH_TEST_ENDPOINTS` in hosting; it exists for the test suite only.
3. Deploy. Then open `/healthz`: it should return `{"ok":true,"database":"ok"}`.
4. Sign up, then in Settings check that "Every record is isolated to your account" shows as true.

Security headers (including a nonce-based Content-Security-Policy) are set by the app itself, so no host configuration is needed. HTTPS is provided by Vercel; the app sends HSTS.

## 2b. Reminder sender schedule

Reminders reach devices only when something calls `/api/cron/reminders` regularly. Vercel's free cron runs at most once a day, so use Supabase's scheduler instead (both extensions are available on the Free plan). In the Supabase SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<the same CRON_SECRET>', 'life_os_cron_secret');
select cron.schedule('life-os-reminders', '* * * * *', $$
  select net.http_post(
    url := '<app-url>/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'life_os_cron_secret')),
    timeout_milliseconds := 20000
  );
$$);
```

Check it: `select status_code, content from net._http_response order by created desc limit 5;` should show `200` and a summary like `{"queued":0,"sent":0,...}`. The sender is safe to call often or twice at once; each delivery is claimed before it's sent, failed sends are retried after 1, 2, 4, 8 and 16 minutes, and a reminder more than a day late is not sent. To stop it: `select cron.unschedule('life-os-reminders');`.

**Not yet verified:** this schedule has only been exercised locally, and notifications have only been delivered to a stand-in push service in the tests. The first real check is turning notifications on from a phone after deploying.

## 3. Releasing changes

- Every change goes through a pull request; run `npm run check`, `npm run test:db` and the Playwright suite locally (see README).
- Database changes are new files in `supabase/migrations`; never edit one that has been applied. Apply with `npx supabase db push` **before** deploying the code that needs it. Migrations so far only add things, so old code keeps working against the new schema.
- Roll back code by redeploying the previous Vercel deployment. Roll back data only from a backup (below).

## 4. Backups and restore

- **Supabase daily backups:** included on paid plans (7 days on Pro); the Free plan has no downloadable backups. Point-in-time recovery is a paid add-on.
- **On the Free plan**, keep your own copy: Settings → Your data → *All data (JSON)* gives a complete export of everything you own, and *All tables (CSV, zipped)* opens in any spreadsheet. A monthly export kept somewhere safe is a reasonable minimum.
- **Whole-database dump** (needs the database password, run from your own computer):
  ```bash
  npx supabase db dump --linked -f backup-schema.sql
  npx supabase db dump --linked --data-only -f backup-data.sql
  ```
- **Restore drill:** restore into a new, empty Supabase project, never over the live one. Run the migrations, load the data dump with `psql`, point a preview deployment at it and sign in. Do this once before relying on it.
- The JSON export is a copy for you to keep. There is no "import a JSON export" feature yet.

## 5. Monitoring

- **Uptime:** point a free uptime monitor (for example UptimeRobot or Better Stack) at `<app-url>/healthz` every 5 minutes. It returns 503 when the database can't be reached, and reveals nothing else.
- **Errors:** server errors are written to the Vercel function logs (Vercel → Project → Logs). Failed exports, failed account deletions and assistant provider errors are logged with a short reason and no personal content.
- **Database:** Supabase → Reports shows query load, and Advisors → Security flags tables without RLS. The repository's `rls_isolation.sql` test fails if any table is missing RLS.
- **Audit trail:** sensitive actions (exports, assistant changes you confirm, settings changes) are written to `audit_events`, which can't be edited from the app.
- Not set up: error tracking with alerts (for example Sentry). It needs another account, so it waits for approval.

## 6. Deleting everything

- A person deletes their own account and data in Settings → Your data. The data is removed at once; it may survive in Supabase's own backups until they roll over (7 days on Pro).
- To shut the whole app down: delete the Vercel project, then pause or delete the Supabase project.
