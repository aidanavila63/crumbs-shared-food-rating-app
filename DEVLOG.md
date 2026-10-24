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

### Round 3 (same session)
- 🟡 **Add to list from the place sheet** (`place-sheet.tsx`, `crumbs-app.tsx`): "Lists" chip row toggles membership; shared with the Lists tab data.
- 🟡 **Map preview card** (`map-tab.tsx`): tapping a pin shows name, status, cuisine/price, rating, Details and Directions; tapping the map or × closes it. Greedy touch gestures, default map UI hidden, map height uses `dvh`.
- 🟡 **Dish notes** (`place-sheet.tsx`, new `DishRow`): per-person notes on dishes (stored in `dish_ratings.notes`), partner's rating + note shown with their name, price shown for AI suggestions. Notes need a star rating first (DB requires a score).
- 🟡 **Offline** (`public/sw.js` rewritten, `components/offline-banner.tsx` new): cache-first for hashed build assets, network-first with cached shell fallback for pages; never touches `/api`, `/auth`, or cross-origin (Supabase/Google). Red banner when the phone is offline. Old cache is cleaned on update (`crumbs-v2`).
- 🟡 **Accessibility** (`components/sheet.tsx` new): sheets are real dialogs (role, aria-modal, label), close on Escape/backdrop, lock background scroll, restore focus. `aria-pressed` on filter chips, `aria-current` + label on the tab bar, labels on every text input and icon button.

### Verified
- `tsc --noEmit` clean; production `next build` succeeds (with fonts stubbed locally because the sandbox can't reach Google Fonts).
- Production build served locally: `/`, `/sw.js`, `/manifest.webmanifest` return 200; compiled CSS contains the new classes; `/api/suggest-menu` rejects signed-out requests with a clear error.
- NOT verified in a real browser or on a phone (no browser available in the sandbox).

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
- [ ] Place sheet: add to a list; dish note; partner's dish note shows
- [ ] Map: tap pin -> preview card -> Details / Directions
- [ ] Airplane mode: red offline banner; reload still opens the app shell
- [ ] Dark mode, iPhone home-screen install

## Tips
- iPhone: magic-link emails open in Safari, not the installed home-screen app. Sign in once in Safari, or use Google sign-in inside the app.

## Round 8 - v2 features
- OpenStreetMap fallback for search and the map when Google fails (Photon + Nominatim + Leaflet).
- Dishes scored 0-100 (`dish_ratings.points`); old stars count as 20 points each. Best dishes leaderboard.
- Visits table (date + optional spend), "On this day", year in review, spend by month.
- Taste match %, who rates harder, cuisine bingo.
- Surprise us with filters (cuisine, price, pinned, within 10 km).
- Photos for places and dishes (public `crumbs-photos` bucket, shrunk on the phone first).
- Paste a Google Maps link to fill a place. Read-only shared lists (`/share/<token>`).
- Push notifications (needs VAPID keys; hidden until `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set).
- **Database:** run `supabase/migrations/20261023_v2_features.sql` BEFORE deploying this code.

## Round 9 - layout v4 + animations (Oct 23, Claude in Cowork)
Delivered as patch files (Claude can't push to this repo). Project-level notes live in the Claude project devlog.

**Earlier commits in the same patch series**
- Removed spend-by-month chart, "who rates harder" and the year-in-review card (backlog #62/#64/#67 = No). `lib/stats.ts` keeps the functions for a future "Crumbs Wrapped".
- OpenStreetMap map no longer covers the buttons (`isolate` on the Leaflet container).
- "What to order" → "Dish highlights" with a MUST TRY tag.
- Next.js 16.4.0 → 16.4.3 (security advisories GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr + Server Actions DoS).

**New layout (4 tabs + profile)**
- Tabs: **Places** (with a Places | Lists switch), **Map**, **Decide & Plan**, **Group**. Old saved tab names (Lists, Goals, For you) map to the new ones.
- **Decide & Plan** (`components/decide-tab.tsx`, was For you): Surprise us, Craving, Tonight?, next up, favourites, tastes, hot takes, monthly challenges, AI ideas.
- **Group**: invite code, together-so-far (counts up), members (owner tag, rating counts), switch group, leave group.
- **Corner avatar → Profile menu** (`components/profile-hub.tsx`): Pokémon GO-style round buttons that bubble in; each opens a full-screen "journal" page with an opening animation and a round ✕ at the bottom centre (no swipe gestures). Pages: Achievements (streak + 9 badges, `lib/badges.ts`), Cuisine passport (bingo), Stats & memories (best dishes, taste match, On this day, photo timeline), Settings.
- **Settings** (`components/settings-panel.tsx`): grouped cards with switches — Animations, Vibration, display name, What you avoid / Blind ratings / Home, notifications, Group settings (rename group; only the group creator sees it), Sign out.

**Animations** (`app/globals.css`, `lib/motion.ts`)
- Tab content slides in from the direction you're heading; sliding highlight behind the active tab; tab icon bounce.
- Cards ease in one after another (`.stagger`); Places | Lists thumb slides.
- Overlays fade/pop in and out; ✕ button spins in; profile buttons bubble in.
- Stars pop on tap; 5★ adds a sparkle burst + a celebration buzz.
- Map pins drop in, the tapped pin grows, its preview card pops up.
- Numbers count up (streak, taste match, group totals); progress bars grow; challenge ticks and bingo squares pop; streak flame flickers.
- Entrance animations use `backwards` fill so no transform lingers (a lingering transform would break `position: fixed` sheets).
- Off switch: Settings → Animations (sets `html[data-motion="off"]`), and the phone's Reduce Motion setting is respected.
- Vibration via `navigator.vibrate` (Android only — iPhone Safari has no vibration API); Settings → Vibration turns it off.

**Other**
- Display-only stars are now spans (they were buttons inside the place-card button → invalid HTML + hydration error).
- Demo mode has more sample data (3 rated places, a partner, visits, dishes) so every screen has something to show.
- `.gitignore`: `tsconfig.tsbuildinfo`, `next-env.d.ts`.

**Verified**: `tsc --noEmit` clean, 31/31 tests (4 new badge tests), eslint 0 errors (warnings all pre-existing). Toured every tab, the profile menu and all four pages in a 390×844 headless browser (demo mode, OSM map): no page errors; Escape closes only the top overlay; the Animations switch flips `data-motion`. Not tested on a real phone.

## Round 10 - batch 2 (Oct 24, Claude in Cowork)
Delivered in the same patch series as Round 9 (`crumbs-batch2.patch` = all 4 commits on top of `main` 85c553f).
- **#27 cheaper Google adds:** the add-place / "Find on map" request now also asks for `regularOpeningHours`, `businessStatus`, `utcOffsetMinutes` and saves them. The request was already Enterprise-tier (priceLevel + websiteURI) and is billed once at its highest tier, so this is free and removes the separate hours lookup the first time a place was opened.
- **#72 Quick log** (`components/quick-log-sheet.tsx`): "Log" button next to + on Places → pick a place (closest first if location allowed, otherwise want-to-try first) → stars (optional) + spend (optional) → logs a visit for today, marks Been, saves your rating.
- **#23 Nearest sort** (live location, falls back to Home) and **#82 search** now matches dish names, dish tags and everyone's notes.
- **#22 / #21 Map:** filter button on the map → rating (3★+/4★+/4.5★+), price, cuisine, and pin colours (by rating / Been-vs-want, remembered on the phone). Selected pin also grows on the OpenStreetMap map; OSM pins only drop in on the first draw.
- **#42 Smart lists** (`lib/smart-lists.ts`): Top rated, Regulars, Rate these, Never again — on the Lists view. **#83** lists can be sorted (Newest / A–Z / Biggest); inside a list there's search + "In list" filter.
- **#63 Cuisine breakdown** in Stats & memories.
- **#44 Invite link + QR:** Group tab → Copy invite link / QR code (`qrcode` package, loaded only when opened). `/?join=CODE` is remembered through sign-in (localStorage, 1 day) and joins automatically; sign-in screen shows "You're invited".
- **#79 Theme + accent:** Settings → Theme (Auto/Light/Dark) and 5 accent colours. An inline `<head>` script (`lib/early-prefs.ts`) applies theme/accent/animations before paint (no flash). CSS: `:root[data-theme]`, `:root[data-accent]`, `--accent-l/-d/-d-fg`.
- **#35 Weather nudge** (`lib/weather.ts`, `components/weather-nudge.tsx`): Open-Meteo (free, no key; CC BY 4.0 attribution shown; free tier is non-commercial — revisit if monetized). Uses Home or already-granted location (never prompts), cached 30 min. Settings → Weather nudges on/off (per phone for now; group-owner setting later).
- Animations: Surprise us result tumbles in like a dice roll; weather emoji floats; filter panel/swatches/smart cards pop; theme changes fade.
- Tests: 35/35 (new: smart lists, weather). Headless tour in demo mode (390×844) with the weather API mocked: join link, nearest sort, dish search, quick log, smart lists, map filters + pin modes, weather nudge, QR, dark + accent persisting across reload — no page errors.

## Round 11 - batch 3 (Oct 24, Claude in Cowork)
Needs the one-time SQL `supabase/migrations/20261025_v4_features.sql` (run in Supabase SQL editor; safe to run twice). The app keeps working before it's run — new features stay hidden until the `home_meals` table exists (`v4` flag in `use-crumbs-data`).
- **Security:** dropped the old `members_join` policy (anyone could add themselves to any group by id); joining is only through `join_group(code)`. `is_group_member` is `security definer`. `profiles.is_admin` can only be changed from the SQL editor (trigger).
- **#43 Roles + group settings** (`components/group-settings.tsx`, owner/admins): name, emoji + colour (#46), rating scale (#2: 5 stars / half stars / 10 points — ratings keep `score` 1-5 plus exact `points` 0-100), category scores (#1), "Would go back?" (#3), whose turn (#37), Home cooking (#77), weather nudges (#35), vibe tags (#8), make/remove admins, new invite code. RPCs `set_member_role`, `remove_member`, `reset_join_code`.
- **Place page:** scale-aware rating input (`components/score-input.tsx`), Food/Service/Vibe/Value, would-go-back chips, vibe tag chips, **#65 balanced score** (`lib/ratings.ts`), reactions + comments on each rating (#11). Dishes: course groups (#18), dietary + spice (#17), want-to-try (#16).
- **Visits:** optional score, people (→ cost per head, #6), dine-in/takeout/delivery (#78), who picked (#37), date/celebration + milestone + note (#69/#70); "getting better / slipping" trend (#5). Quick log has the same extras + "Cooked at home instead?".
- **#77 Home cooking** (`components/home-tab.tsx`): Places | Lists | Home switch; meals with ratings, make-again, recipe link + notes, dietary/spice, photo, "We made it today" log, "What should we cook?".
- **Group tab:** #45 "What's new" feed (written by DB triggers into `activity`, pruned at 120 days; blind ratings hide scores) with reactions/comments, #69/#70 Memories (on this day + milestones). Decide tab: #37 Whose turn (pick + cook).
- **#21 Admin page** (profile menu, only when `profiles.is_admin`): usage counts (`admin_stats()`), feature switches (#109; `ai_ideas` + `menu_import` seeded "everyone", also checked server-side in the API routes), feedback inbox (#108), error log (#110, max 5 per page load, last 500 kept), waitlist (#94).
- Settings: notification types (rating/place/dish/craving, respected by `/api/notify`), Send feedback.
- Tests 42/42 (new: ratings, turns, memories). SQL verified on Postgres 16 (fresh build of schema + all migrations, v4 run twice) with RLS tests. Headless demo tour: place page in all 3 scales, visits, reactions/comments, Home, Whose turn, feed, admin — no page errors.

## Round 12 - batch 4 (Oct 24, Claude in Cowork)
Uses the same one-time SQL (`20261025_v4_features.sql`, now with two more functions added — still not run anywhere, still safe twice). New dependencies: `tesseract.js` (photo text reading, on the phone) and `posthog-js` (analytics, off unless a key is set).
- **Decide together** (`components/decide-together.tsx`, `hooks/use-decide.ts`, `lib/decide.ts`): category card on Decide & Plan → own page. Start a vote from Want to try / favourites / everything / a list, optionally by occasion (#34: date night, quick bite, cheap eats, celebration, somewhere new, old favourite + the group's vibe tags). **#30 swipe** (drag or ✕/♥ buttons, YES/NOPE stamps, fly-out) or **#40 vote as a list**; results show matches (everyone said yes) → "Plan it". Live via realtime.
- **#48 Plans** (`components/plans.tsx`): plan a dinner (title, time, place or "vote on it", note), RSVP In/Maybe/Can't, **#76 Add to calendar** (.ics with a 2-hour reminder). Plans card on Decide & Plan; plans show in the group feed.
- **#26 Food crawls** (`components/crawl-planner.tsx`): lists with kind `crawl`, ordered stops (up/down/remove, "Shortest order"), walking time per leg, "Walk it in Google Maps" (plain link, no API cost), "Show on map" draws a dashed route with numbered pins (Google + OSM). Crawls are hidden from the Lists view.
- **#24 Heatmap:** map filter panel → Show: Pins / 🔥 Where we eat most (warm circles sized by visits; Google's own heatmap layer is retired so it's drawn with circles on both maps).
- **#32 Tonight filter:** budget, distance (from Home), open now, cuisine — remembered on the phone.
- **#36 Because you loved…:** want-to-try places with the same cuisine as places you rated 4★+, nearest first; plus "Ramen near Hana Ramen" discovery from OpenStreetMap (`/api/osm/nearby`, Overpass, free, cached a day per area) with one-tap "add to Want to try".
- **#94 Landing page** `/welcome` (public) with waitlist form (honeypot, duplicate-safe); sign-in screen links to it.
- **#75 Offline quick logs** (`lib/offline-queue.ts`): with no signal the log is kept on the phone and sent when back online (safe to retry; same visit id). Banner shows how many are waiting.
- **#74 Receipt scan** (Quick log → Receipt) and **#19 Menu photo** (place page → Menu photo → tick/fix dishes → add): text read on the phone with tesseract.js (engine ~5 MB downloads on first use, then cached). Parsing in `lib/ocr-parse.ts`.
- **#88 Delete my account** + **#89 Back up the group** (Settings → Your data): `delete_my_account()` passes groups you own to the next member (admins first; solo groups are deleted) and credits your shared adds to the group owner; `export_group()` downloads everything as JSON.
- **#107 PostHog** (`lib/analytics.ts`): off unless `NEXT_PUBLIC_POSTHOG_KEY` is set. No autocapture, no recordings, anonymous user id. Events: app_open, tab, place_added, rated, quick_log, decide_started, plan_made, crawl_created, home_meal_added, photo_read.
- Tests 50/50 (new: decide, nearby, OCR parsing). SQL delete/export tested on Postgres 16. Production build passes. Demo tours: swipe (drag + buttons), results → plan → RSVP, crawl + map route, heatmap, Tonight filter, recommendations, landing + waitlist, Your data — no page errors. OCR and Overpass not tested live (blocked in the build sandbox).

## Round 13 - shared restaurant profiles + Explore (Oct 24, Claude in Cowork)
Still one SQL step (same v4 file; new section 13a). Aidan's direction: menu-photo dishes should feed the whole location profile — "tangible data we can claim".
- **Shared restaurant profiles** (`restaurants`, `restaurant_dishes`, `restaurant_dish_votes`; `places.restaurant_id`): one copy per real restaurant for all of Crumbs, keyed by Google place id or `osm:` id. Same name within ~60 m collates Google + OSM copies into one. Only restaurant facts live there (address, hours, menu) — never ratings, notes or who goes where. Readable by any signed-in user; writable only through security-definer functions and only for restaurants one of your groups saved: `link_restaurant`, `share_restaurant_hours`, `add_restaurant_dishes`, `vote_restaurant_dish`, `search_restaurants`.
- **Community menu** on the place page (`components/community-menu.tsx`, `hooks/use-restaurant.ts`): grouped by course, price + "price from 7 months ago", ✓ "on the menu" / ✕ "not any more" (2+ flags outnumbering confirms hides a dish; 3 flags and no confirms deletes it), "+" to copy a dish into your group's list to rate, "Add all". Menu photos (after you tick/fix them) and website imports both feed it; adding a dish that's already there counts as a confirmation and refreshes its price.
- **Cheaper Google:** add-place search shows "On Crumbs" matches first (free); picking a Google result that another group saved in the last 60 days reuses the shared copy instead of an Enterprise details lookup; hours younger than 14 days are reused from the shared profile, and fresh lookups are shared back.
- **Explore on the map** (🔭 button above Locate): everything to eat around where the map is looking (~1.2 km, OpenStreetMap via Overpass, free, cached a day), dashed "+" pins for places you haven't saved, tap → "+ Want to try" (linked to the shared profile). Shared helper `lib/add-found.ts`.
- Admin counts: shared restaurants + menu dishes.
- Tests 52/52 (new: restaurants). SQL tested on Postgres 16: cross-group sharing, non-members blocked (read-only, direct writes refused), flag hiding, Google/OSM collation, delete account with links. Production build passes; demo tours clean.
