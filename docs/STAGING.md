# Staging: try changes on a copy before members see them (#228)

Everything here stays on free plans.

## One-time setup

1. **Second Supabase project** (free plan allows two active projects): call it `crumbs-staging`.
   - SQL Editor: run `supabase/schema.sql`, then every file in `supabase/migrations/` in date order.
   - Authentication → URL Configuration → Redirect URLs: add `https://*.vercel.app/auth/callback`.
   - Turn on Google sign-in the same way as production (same Google client is fine; add the
     staging callback `https://<staging-ref>.supabase.co/auth/v1/callback` to it).
2. **Vercel → Settings → Environment Variables**: give the **Preview** environment the staging values
   and leave **Production** on the live ones:
   | Variable | Preview (staging) | Production |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | staging URL | live URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `_ANON_KEY`) | staging key | live key |
   | `SUPABASE_SERVICE_ROLE_KEY` | staging service key | live service key |
   | `CRON_SECRET` | any value | live value |
   Push keys (VAPID), analytics and photo storage can be left off Preview.
3. Vercel only runs the daily job on Production, so staging never sends reminders or backups.

## Each change

1. Push a branch → Vercel builds a Preview link that talks to the staging database.
2. If the change has SQL, run it on **staging first**, try the preview, then run it on live.
3. Merge → Production deploys against the live database.

## Keeping staging awake

Free Supabase projects pause after a week without use. If it's paused, press **Restore** in
Supabase; nothing is lost. Production is kept awake by the daily job.
