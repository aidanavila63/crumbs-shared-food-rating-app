# Crumbs devlog

Working branch (local, not yet uploaded): `claude/finish-crumbs`, based on `v0/polish-crumbs` @ 2778c14.
Production (`main`) is still the old simple version. Nothing below is live until we do the upload.

**Upload status legend:** 🟡 pending upload · 🟢 uploaded · 🔴 needs your action

## Upload checklist (do all at once when ready)
1. Give the Claude GitHub app write access to the repo (Contents: read & write).
2. Claude pushes branch `claude/finish-crumbs` and opens a PR into `main`.
3. Test the Vercel preview on your iPhone (see "Test checklist" at the bottom).
4. Merge to `main` -> production redeploys.
5. Not uploadable by Claude (binary): resized PWA icons (see "Known issues").

## Session 1 (Oct 21)

### Findings (bugs in the v0 code)
- 🟡 Stylesheet was ~30 lines of colour variables. None of the custom classes the components use (`surface`, `chip`, `field`, `primary`, `secondary`, `sheet`, `tab-bar`, `marker`, ...) existed, so the whole UI was unstyled.
- 🟡 Fonts fell back to Georgia (CSS referenced `'Young Serif'` instead of the next/font variable).
- 🟡 Existing groups were never loaded after sign-in; refresh = "Start your food map" again.
- 🟡 No Google search existed; manual places had no coordinates so the map never showed pins.
- 🟡 Group tab never received a profile (name editor broken), no members list.
- 🟡 `/api/suggest-menu` had no auth check (anyone could spend AI credits).
- 🟡 `google` global type missing (type error hidden by `ignoreBuildErrors`).
- 🟡 Dishes list sorted its own state in place; dish stars were display-only.

### Changes
- 🟡 `app/globals.css`: full design system (plum accent `#7B2D5B`, sage background, dark mode via `prefers-color-scheme`, bottom sheets, tab bar, chips, markers, safe areas, reduced motion).
- 🟡 `app/layout.tsx`: `viewport-fit=cover`, light/dark theme colours, Apple web-app meta, service worker registration.
- 🟡 `components/sw-register.tsx` (new): registers `/sw.js` in production.
- 🟡 `components/maps-provider.tsx` (new): single Google Maps `APIProvider` for the whole app (places + marker libs).
- 🟡 `components/place-search.tsx` (new): Places (New) autocomplete with session tokens, 300ms debounce, 3-char minimum, location bias; requests only `id, displayName, formattedAddress, location, priceLevel, websiteURI, googleMapsURI, primaryType`. Also `findOnGoogle()` (Text Search) for places saved without coordinates.
- 🟡 `components/add-place-sheet.tsx`: uses PlaceSearch; saves coordinates/cuisine/price/website/maps link; friendly duplicate error.
- 🟡 `components/place-editor.tsx` (new): edit name/address/cuisine/price/tags, pin toggle, "Find on Google" for places without a map pin.
- 🟡 `components/place-sheet.tsx`: editor, partner's real name, dish ratings + remove dish, non-mutating sort.
- 🟡 `components/map-tab.tsx`: uses shared provider; safe bounds fit.
- 🟡 `hooks/use-crumbs-data.ts`: loads groups on sign-in, remembers last group, loads members/profiles, shows load errors as toasts.
- 🟡 `components/group-tab.tsx`: members list, working display name, leave group.
- 🟡 `components/for-you-tab.tsx`: real insights (next-up from wishlist, group favourites, taste, disagreements) + AI ideas button.
- 🟡 `app/api/recommend/route.ts` (new) and `app/api/suggest-menu/route.ts`: require sign-in, input limits, proper error responses.
- 🟡 `lib/use-user-location.ts` (new): cached geolocation hook.
- 🟡 Code auto-formatted (prettier) so files are readable; `.prettierrc` added.

### Round 2 (same session)
- 🟡 `components/lists-tab.tsx`: open list was a stale copy so the "Added" label never changed; now derived by id. Empty-state no longer shows inside an open list.
- 🟡 `hooks/use-crumbs-data.ts`: realtime events no longer flash "Loading your places…" (spinner only on first load of a group).
- 🟡 `components/crumbs-app.tsx`: open place sheet now stays live (selected place derived from data by id, so your partner's new rating appears while it's open); no more sign-in screen flash while auth is checking; search also matches cuisine + tags; sort (Newest / Top rated / A–Z); "🎲 Surprise us" picks a random want-to-try place.
- 🟡 `components/place-card.tsx`: shows cuisine and price level.
- 🟡 `components/map-tab.tsx`: "Locate me" button actually recenters now (it did nothing before); banner counting saved places with no map pin.

### Verified
- `tsc --noEmit` clean; production `next build` succeeds (with fonts stubbed locally because the sandbox can't reach Google Fonts).
- NOT verified in a real browser or on a phone.

## Known issues / not done yet
- 🔴 `public/icon-192.png` is the same 763KB file as `icon-512.png` (binary, Claude can't upload through the GitHub connector).
- 🔴 AI features need Vercel AI Gateway enabled on the project (unchecked).
- Supabase `schema.sql` in the repo is older than the live DB (live DB has the group-edit migration and the fixed `create_group`/`join_group`). Do NOT re-run schema.sql.

## Test checklist (for the preview)
- [ ] Sign in, refresh: you land in your group, not "Start your food map"
- [ ] Add place via search -> appears with address; shows on Map tab
- [ ] Old manual places: open -> "Find on Google" -> pin appears
- [ ] Rate stars; partner sees it (second device)
- [ ] Add/rate/remove a dish; Suggest menu
- [ ] Edit details + tags + pin
- [ ] Lists, For you, Group (rename, members, share code)
- [ ] Sort chips, search by cuisine/tag, Surprise us
- [ ] Map: Locate me, unpinned banner
- [ ] Dark mode, iPhone home-screen install

## Tips
- iPhone: magic-link emails open in Safari, not the installed home-screen app. Sign in once in Safari, or use Google sign-in inside the app.
