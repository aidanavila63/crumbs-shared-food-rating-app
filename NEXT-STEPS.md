# Next steps

1. Supabase -> SQL Editor: paste and run `supabase/migrations/20261023_v2_features.sql` (safe to re-run). Do this BEFORE pushing.
2. `git config core.autocrlf false`, then `git am ~/Downloads/crumbs-all-updates.patch`, then `git push`.
3. Google sign-in ("provider is not enabled"): Supabase -> Authentication -> Sign In / Providers -> Google -> switch on,
   paste the Client ID and Secret from Google Cloud Console -> APIs & Services -> Credentials -> OAuth client (Web).
   In that Google client add this Authorised redirect URI: https://zatyzwsmlfmzapzwvcui.supabase.co/auth/v1/callback
   In Supabase -> Authentication -> URL Configuration keep `https://*.vercel.app/auth/callback` in Redirect URLs.
4. Notifications (optional): add the 3 values from NOTIFICATION-KEYS-private.txt to Vercel -> Settings -> Environment Variables
   (All Environments), redeploy, then each phone: Share -> Add to Home Screen, open Crumbs from the icon, Group tab -> Notifications -> Turn on.
5. Test on the preview, merge the PR, then restrict the Maps key to your production domain.
