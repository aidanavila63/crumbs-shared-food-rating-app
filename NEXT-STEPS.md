# Next steps – the big push

Do these in order. Everything stays on free plans.

1. **Database first** – Supabase → SQL Editor: paste and run `supabase/migrations/20261025_v4_features.sql`
   (safe to run again). Then run the admin line at the very bottom of that file on its own, with your sign-in email.
   Then run `supabase/migrations/20261026_after_v4.sql` (public groups, recipe details + saves, head to head,
   answers that show straight away). From now on every change comes as a new dated file like it.
2. **Code** – `git config core.autocrlf false`, then `git am ~/Downloads/crumbs-batch30.patch`, then `git push`.
3. **Vercel → Settings → Environment Variables** (All Environments unless noted), then redeploy:
   - `SUPABASE_SERVICE_ROLE_KEY` – Supabase → Project Settings → API keys → service_role / secret key.
     Needed for the daily job (reminders, keep-awake, backups, limit alerts) and the menu-PDF queue.
   - `CRON_SECRET` – any long random text. Vercel sends it to the daily job so nobody else can run it.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` – push notifications (optional).
   - `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` (analytics) and `R2_*` + `NEXT_PUBLIC_R2_PUBLIC_URL` (photos) – optional.
   - AI (menu photos and PDFs): Vercel → AI Gateway must be switched on for the project; no key needed on Vercel.
4. **Google sign-in** – unchanged; see the Supabase/Google steps in `DEVLOG.md` if it ever stops working.
5. **Check the push** – GitHub → Actions: the three checks (code, database security, demo click-through)
   should be green. Then try the Vercel preview on your phone before merging.
6. Optional: set up staging (`docs/STAGING.md`) so future SQL is tried on a copy first.

Free-plan note: the menu-PDF queue reads about 4 PDFs per run on the free Vercel plan (60-second limit);
the rest wait for the next run. The month-end catch-up uses whatever AI allowance is left.
