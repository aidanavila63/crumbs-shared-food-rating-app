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

## Round 14 - owning the data (Oct 24, Claude in Cowork)
Aidan: "do what we can to build up our own data as much as possible — everything geared to making this self-sustaining." Google's terms only let us keep place IDs forever and coordinates for 30 days; names, addresses, hours etc. can't be stored. So every profile fact now records where it came from, and members + open data replace Google's copy over time. Still one SQL step (same v4 file, new section 13c).
- **Sources on every fact** (`restaurants.sources`, `verified`): `crumbs` (members saw it) beats `osm` (OpenStreetMap, free to keep forever with credit) beats `google` (borrowed). A trigger fills sources for new profiles. Before going public the `google` fields can be dropped without losing anything Crumbs owns.
- **Members add facts** (`restaurant_facts`, `contribute_fact`): address, hours, phone, website, price, cuisine, open/closed — each with "how do you know?" (I was there / photo / their website / called them). Applies at once over Google or OSM; changing something members already set needs 2 people to agree; repeating the same value is a confirmation ("✓ Crumbs · 2"). Google's value is never offered as the starting text — members enter what they see.
- **Restaurant info card** on the place page (`components/restaurant-profile.tsx`): "% Crumbs-owned" meter, each field with its source tag, "✓ Still right" / "Fix" / "Add what you see", hours typed freely or **read off a photo of the door sign** (`lib/hours-text.ts` parses "Mon-Fri 11am-10pm; Sun closed" and OSM `opening_hours`). Hours members add also update the group's "Open now" line. Totals from all groups' visits (`restaurant_insights`: visits, groups, ~$ per person after 3+ visits, % takeout) — Crumbs' own data, never per group.
- **OpenStreetMap enrichment** (`/api/osm/match`, `lib/osm-match.ts`, `merge_open_data`): when a profile is opened, the matching OSM place (similar name within 80 m) fills address/phone/website/cuisine/hours where we only had Google or nothing. Once per restaurant every ~3 months.
- Shared hours from members/OSM are trusted for 90 days (Google's for 14) before any new Google lookup.
- **Building Crumbs** card in Achievements (`my_contributions`): facts, menu dishes, checks, places helped + 5 badges (Scout, Map maker, Menu maker, Fact checker, Local legend).
- **Admin**: free-tier meters (database vs 500 MB, photos vs 1 GB; amber at 60%, red at 80% with what to do), and "Data Crumbs owns" (% of restaurants with owned hours / address, facts added).
- Tests 58/58 (new: hours text, OSM match, ownership). SQL tested: 2-person rule, confirmations, OSM can't override members, bad websites refused, insights. Build passes; demo tour clean.

### Go-public data checklist (not built yet — do before launch)
1. Purge `google`-sourced fields from `restaurants` (and Google names/addresses/hours from group `places`, keeping place IDs; re-fetch live when shown).
2. Show Google-only details live (fetched when opened, not stored), with Google attribution; never on the OSM map.
3. Consider importing Overture Maps places (CDLA-Permissive-2.0, keep forever) for cities as they're needed, as the base layer under member facts.
4. OSM data in a publicly shared database triggers ODbL share-alike — keep OSM-sourced fields marked (already done via `sources`).

## Round 15 - quieter data building, cross-checks, contributor tiers (Oct 24, Claude in Cowork)
Aidan: the "% owned / building" card is an eyesore — fill data more subtly, keep achievements (tiered: more help → more), cross-reference member input before claiming it, maybe higher usage for contributors; be covered for expansion / going public / monetization. Asked about Uber Eats / SkipTheDishes.
- **No more Restaurant info card.** Data is gathered quietly:
  - **Quick question** (`components/quick-check.tsx`): one small dismissible prompt on places you've *been* to, only for details that are missing or only Google's ("Know their hours?" → Snap the sign / Type them; "How pricey?"; "Still open?"). At most one per place every 14 days and 3 a day; Settings → Quick questions to switch off.
  - **"Something wrong or missing? Suggest an edit"** — a small link at the bottom of the place page opens the editor page (no percentages, no source labels; a small ✓ marks details several people checked).
  - **Receipt or order screenshot** in Quick log now also reads the items ("2 Pork Gyoza 19.00" → Pork Gyoza $9.50) → "What you ordered" step adds them to your dishes and to the restaurant's shared menu as `receipt` evidence (`lib/ocr-parse.ts` `receiptItems`). Works with Uber Eats / Skip order confirmations — the member's own data.
  - "About $24 a person · from Crumbs visits" line under the hours when there's enough data.
- **Cross-checked = claimed:** a detail is *claimed* as Crumbs' own when members of 2+ different groups agree, when a member independently confirms the OpenStreetMap value, or when 2 people agree and one had a photo/receipt (`verified.claimed`). Menu dishes are claimed when confirmed by 2+ groups (`restaurant_dishes.claimed`).
- **Contributor tiers** (`lib/tiers.ts`, `my_contributions` → points/tier): 🌱 Taster 0 · 🍴 Regular 25 · 🧭 Local guide 100 · ⭐ Insider 300 · 👑 Legend 1000 points (detail 3, dish/check 1, +5 when others back you up). Each tier raises daily allowances for AI ideas / Explore / menu imports (`lib/tier-limits.ts`, enforced in the API routes; admins get the top tier). Achievements → Building Crumbs shows tier, progress, perks, all tiers and 6 badges.
- **Admin:** claimed details/dishes, and a going-public check: how many details are still only Google's.
- Tests 60/60; SQL cross-group claiming tested; build passes; demo tour clean.

### Uber Eats / SkipTheDishes (researched)
- Scraping is against Uber's terms ("may not… launch any programs or scripts for the purpose of scraping"). Their APIs are for restaurants' own POS/menu integrations (merchant-authorised, written approval) — not a data source for Crumbs.
- What works: (1) members' own receipts/order screenshots (built), (2) later, restaurants that claim their Crumbs profile (#100) can connect or upload their own menu, (3) "Order on Uber Eats" link-outs via Uber's affiliate program for revenue once public (no data).

## Round 16 - always-on questions, spending guard, restaurant claims (Oct 24, Claude in Cowork)
Aidan: always ask for data we don't have, rotate questions per person, then ask the oldest data due an update (name/address once; phone/website ~6 months); no off switch ("our version of an ad"); limit points and bring tiers in carefully; never risk paying for others' use past free limits; restaurants claiming their page is best.
- **Quick questions are server-picked** (`next_question`): missing details first, then details only Google has, then the oldest member check that's due. Refresh windows (`fact_refresh_days`): hours 120 days, phone/website 180, status 90, price 365, address/cuisine/name only when missing. Each person gets a different order (hash of person + detail + restaurant) and isn't re-asked something they answered within its window. "Not sure" skips that question for that person 90 days, ✕ for 7 (`skip_question`). Stale questions show what we have: "Still these hours? Mon-Sat 11:30am-10pm" → Yes, still right / Snap / Type the new ones / Not sure. Shown on every place you've been; the Settings switch is gone. Owner-managed details are never asked.
- **Points are a ledger** (`contribution_points`, `award_points` — not callable by users): max **40 a day**; a detail only earns when it adds something (new, changed, not ours yet, or due a re-check) and at most once per detail per restaurant per month; +5 "backed up" bonus once per detail per month; dishes/checks once each.
- **Spending guard** (`usage_budgets`, `usage_counts`, `use_allowance`): AI ideas, menu import, Explore and **Google lookups** each have an overall per-day and per-month budget plus a small per-person daily allowance by tier (AI 3→8, menu import 2→4, Explore 15→40, Google 10→20). Defaults: AI 150/day & 3,000/month; menu import 60/1,200; Explore 1,500/day; Google 40/day & **900/month** (under the 1,000 free Enterprise lookups). Over budget, Google picks fall back to OpenStreetMap (place ID kept), hours refreshes skip. Admin → Spending guard shows today/month and lets you change every number. API routes use the database count (the old in-memory limiter only before the SQL runs).
- **Restaurant claims (#100)** (`restaurant_claims`, `restaurant_managers`, `claim_restaurant`, `review_claim`): "Own or manage {name}? Claim this page" at the bottom of Suggest an edit (behind admin switch `restaurant_claims`, seeded **Admin** — flip to Everyone when public). Admin → Restaurant claims to approve/decline after checking by email/phone. Approved managers' details apply instantly as source `owner` (shown "✓ Restaurant"), count as claimed, and members need 3 agreeing to overrule them; their menu additions count too.
- Tests 60/60; SQL tested (question rotation + skips, personal and overall budgets, admin-only budget edits, claim → approve → owner wins, 40-point cap, award_points not callable). Build passes; demo tour clean.

### Uber Eats / SkipTheDishes partnerships (researched)
- **Uber affiliate program** (Canada page): pays commission for new users' first Uber Eats order; rates negotiated after acceptance; Uber vets brand safety, active users and tracking. No mention of restaurant-page deep links.
- **SkipTheDishes**: affiliate program active on the AWIN network (rate not public).
- Both are link-outs for revenue once public (an "Order delivery" button); neither gives menu or restaurant data.

## Round 17 - Verified by Owner, new-info-only points, Yes/No/Snap questions (Oct 24, Claude in Cowork)
Aidan: skip the "still open" question; price comes from menu data; answers are just Yes / No / Snap a picture; only NEW info earns points, points expire and tiers must be kept up, points worth less; in-app actions (receipts etc.) collect data but earn nothing; "Verified by Owner" check like Instagram; members can't change most owner details; owner tag on the person without naming the restaurant; owners manage their page(s).
- **Quick questions:** only hours, phone, website (and cuisine/address when missing). Always three answers: **Yes · No · Snap a picture**. A confirmation of Crumbs' own value ("Is +1 416 555 0199 still their number?"): Yes confirms, No opens "what is it now?". A "Know their phone number?": Yes → type it, No → not asked again for 90 days. Snap reads hours (sign), phone or website (`lib/fact-parse.ts`) off the photo and pre-fills it to check. ✕ = 7 days. Never on a Verified-by-Owner page's locked details, never for the owner.
- **Price from the menu** (`refresh_menu_price`): middle price of the mains (or non-drink/side/dessert dishes) once 3+ have prices → $ <15, $$ <25, $$$ <40, $$$$. Runs after menu photos, receipts, imports, votes and owner edits. Members no longer edit price; the editor shows "from menu prices".
- **Points (new info only):** detail 2 (a gap filled, Crumbs' own copy of a Google-only detail, a change that actually applies, or a re-check that's due) · +2 when others back you up · 3 for a menu photo that adds 3+ new dishes (once a quarter per restaurant). **Nothing** for receipts, website imports, ticking dishes, re-confirming fresh info, or owners. Max **20 a day**. Points count for **6 months** (`points_window_days`), so tiers must be kept up: 🍴 Regular 25 · 🧭 Local guide 75 · ⭐ Insider 200 · 👑 Legend 500 (`tier_for_points`, `my_tier`). Achievements card shows points expiring this month and the server's real allowances (lib/tiers.ts now matches `usage_budgets`: AI 3→8 a day, etc.). Ledger rows tidy themselves after ~13 months.
- **Verified by Owner (#100):** an approved claim sets `restaurants.owner_verified` and `profiles.restaurant_owner` (trigger on `restaurant_managers`; users can't set either). Blue check "Verified by Owner" under the name on the place page, on owner-set details and on owner-checked dishes. `restaurant_managers` is now private (own rows + admin), so nobody can see which restaurant someone runs — their profile just shows a "Restaurant owner" tag (profile + group members).
- **Locked details** (`owner_locked`): name, address, map pin, hours, phone, website, cuisine, price — only the owner changes them. Members' answers become **suggestions** ("Tell the restaurant", no points). Open? (status) stays member-changeable but needs 3 agreeing on owner pages. Google/OSM refreshes never overwrite member, owner or open data any more (`link_restaurant`, `share_restaurant_hours` fixed — they used to relabel Google values as Crumbs').
- **Your restaurants** (own area in the profile menu, owners only): each page you run → Members suggest (grouped, never who: Use this / Keep mine), Details (edit anything, goes live), Menu (Snap your menu, add a dish, edit name/price/kind, remove; flagged dishes shown so you can fix them), totals (saves, visits, $/person, takeout share). New SQL: `my_restaurants`, `owner_suggestions`, `keep_owner_value`, `owner_edit_dish`, `remove_manager` (Admin → Restaurant claims → Verified owners → Remove).
- **#84 Text size:** Settings → Look & feel → Small / Default / Large / Largest (all font sizes are now rem; inputs stay ≥16px so iPhones don't zoom).
- **#18 per-kind dish rankings:** Stats → Best dishes has All / Starters / Mains / … chips once a kind has 2+ rated dishes.
- Tests 65/65; SQL tested on a fresh database (new-info points, cap, expiry, menu-photo points once, receipt no points, menu price, private managers, owner flag protection, claim → verified → suggestions → use/keep → dish edits → remove owner). Build passes; demo tour clean.

## Round 18 - ask about everything we don't own, menu points in sets of 3, member prices, owner-away rule (Oct 24, Claude in Cowork)
Aidan: quick questions should ask about everything Crumbs can't claim as its own (open data is fine to use but still worth getting); members can somewhat edit prices (price level from our scale stays); confirmations give a limited number of points; no cap on points but tiers higher and points expire sooner; menu points in sets of 3 with a queue of 10; owner suggestions apply if enough people agree and the owner is inactive a long time.
- **Quick questions ask about everything Crumbs can't call its own** (`next_question(target, skip)`), in this order: missing → only Google's (can't be kept) → said by one member (needs a cross-check) → OpenStreetMap (fine to use, better to own) → our own when a re-check is due. Now includes the **name** ("Is it called “Hana Ramen” on the sign?") and the **map pin** ("Are you at Hana Ramen right now?" — only when location is already allowed and the phone is within ~150 m with a good fix; Yes saves the phone's position as Crumbs' own pin, `lib/here.ts`). Values are only shown back when they're ours or open data (never Google's), except the name. A pin moved 300 m+ always needs two people.
- **Points (all numbers in `point_rules`, Admin → Points):** new detail 2 · confirming a detail one member gave (or open data) before it's claimed 1, only for the first 3 people · the people who said it first get +2 once when it's claimed, however many agree later · **no daily cap** · points last **90 days** · tiers **30 / 100 / 250 / 600**.
- **Menu points in sets of 3** (`menu_bundles`, `bundle_dish`, `settle_menu_bundles`): every 3 new dishes you add (menu photo or typed, any number of uploads) = 1 point straight away; +1 when each of the 3 is confirmed — dish and price (✓ given after the price was last set) — by 2 other people or the owner. Up to **10 sets** can wait at once; more dishes are still saved, shown and confirmable but don't earn until a set is confirmed. A set drops out if one of its dishes is flagged off/removed, or after 90 days. Receipts and website imports still earn nothing.
- **Members fix menu prices** (`suggest_dish_price`, `restaurant_dish_prices`): tap a price on the menu (or "add price"). No price yet → used straight away; otherwise it changes when 2 people say the same new price; on a dish the owner checked it goes to the owner. A menu photo of an owner-checked dish also becomes a suggestion instead of overwriting. Price level still follows the menu (`refresh_menu_price`).
- **Owner away** (`settle_owner_suggestions`, `restaurant_managers.last_active_at`): owners see all suggestions incl. dish prices (Use this / Keep mine). If the owner hasn't used Crumbs for **30 days** and **3+ people from 2+ groups** have said the same thing for **2+ weeks**, it's applied for everyone (marked `owner_away`). Runs when someone opens the page or sends a suggestion. Owner activity = opening Your restaurants or changing anything.
- Admin → **Points** card to tune every number (window, tier thresholds, values, menu queue) without code.
- Tests 67/67; SQL tested on a fresh database (question order incl. name/pin + skip list, limited confirm points + one backed bonus, menu sets: points, confirmation, queue limit, receipts don't count, price suggestions 1 → 2 people → applied, owner away rule waits for 30 days/2 weeks, admin-only rules). Build passes; demo tour clean.

## Round 19 - no company names in the app, menu points in steps of 5 with a waiting line (Oct 24, Claude in Cowork)
Aidan: nothing in the app should talk about Google or other organizations/services; menu queue is per person across all restaurants; 5 dishes = 1 point, every 5 confirmed = 2; extra dishes wait in a second line and move into the points queue as room frees; confirmed = 2 people's ✓ or the owner's ✓; earlier ✓s on a wrong item don't count.
- **App text:** removed company/service names from everything members see (search, map toggle → "Use main map / Use basic map", place info, points card, Home cooking / group settings notes, welcome install tips, notification tip, vibration note, crawl "Walking directions", map-link import, API error messages). **Kept on purpose:** the "© OpenStreetMap contributors" credit where open map data is shown (required by its licence), the map provider's own logo inside the map, the weather credit (required by its licence), and "Continue with Google" on the sign-in button (people need to know which account; the provider's rules require the name). Admin-only notes still name services (your costs).
- **Menu points** (`menu_contributions`, `menu_counts`, `menu_add`/`menu_fill`/`menu_settle`/`menu_pay`; replaces sets of 3): per person across all restaurants. New dishes (menu photo or typed) go into your points queue — up to **50 dishes**; every **5** that enter it = **1 point**. More dishes wait in line (no points) and move in automatically, oldest first, when spots free. Every **5 of your dishes confirmed = 2 points**. A dish confirmed while still in line gets its initial share too (full 3 per 5). A dish leaves the queue (spot freed, points kept) when confirmed, flagged off the menu/deleted, or not confirmed within 90 days. Running totals only go up, so nothing is paid twice.
- **Confirmed** = 2 people other than the adder tick ✓ after the dish was last changed (price), or the owner ticks ✓ / adds / edits it. Owners can now tick dishes on their own menu.
- Admin → Points: menu step (5), points per step added (1) / confirmed (2), queue size (50).
- Tests 67/67; SQL on a fresh DB: 12 dishes with a 10-dish queue (10 in, 2 in line, 2 points), 5 confirmed (+2, line moves in), a price change voids earlier ✓, dishes confirmed while in line earn the full 3, receipts add nothing. Build passes; demo clean.

## Round 20 - value score, other groups' ratings, rating sharing, trips switch, must-try on the map (Oct 24, Claude in Cowork)
Aidan: keep making features.
- **#6 Value score** (`lib/value.ts`): "💸 Value 8/10" under the group average. Your group's rating, nudged up when it cost less a person than your usual (middle of your places) and down when it cost more (√ of the ratio: half price ≈ +40%, double ≈ −30%). Visits without a head count assume the group's size. Needs 3+ places with a spend. New smart list **💸 Best value** (8/10+). Runs on the phone, nothing stored.
- **#52 Your other groups:** on a place page, if other groups you're in saved the same restaurant (same map id or same shared profile), shows each group's average and your own score there. Respects blind ratings ("Rate it to see").
- **#47 Choose which groups see each rating** (Settings → What you avoid card → "Your ratings in your other groups": Just there / Ask me / All of them; `profiles.share_ratings`). "All" copies your scores (overall, categories, would-go-back — never notes) to your other groups' copies of that place; "Ask me" offers chips after you rate. Only into groups that already saved the place.
- **#29 Trips switch** in Group settings (on by default — was always on); off hides the trip panel on lists.
- **#14 MUST TRY on the map preview card** (best must-try dish), shared `mustTry()` helper (best first).
- Map: removed the map library's badge (kept only the required map-data credit).
- Tests 70/70; SQL: share_ratings column + check tested; build passes; demo clean.

## Round 21 - AI menu photo reading for the admin (#19 AI version) (Oct 24, Claude in Cowork)
- **"Menu photo (AI)"** next to Menu photo on the place page (`components/photo-reader.tsx` AiMenuPhotoButton → `app/api/read-menu-photo`). The photo (shrunk to ~1600 px JPEG, never stored) is read by the AI into dishes with prices, descriptions and course, then goes through the same tick-and-fix review, into your dishes and the shared menu (counts for menu points like any menu photo).
- Admin switch **`menu_ai`** seeded **Admin** (a missing switch also means admins only); new budget **`menu_photo_ai`**: 20/day, 300/month overall, 0 per person by tier — so only admins (exempt from personal limits) until you raise those numbers in the Spending guard. Server checks switch + budget, so it can't be called around.
- `useFlags` switches can now default to off (`flag(key, fallback)`).
- Tests 71/71 (image check); build passes; demo clean.

## Round 22 - group cover photo, automatic backups, photos on R2 when needed (Oct 24, Claude in Cowork)
- **#46 Group cover photo:** Group settings → Group look → Cover photo (`groups.cover_path`, same photo folder as the group's other photos). Shows as a banner with the group's emoji + name at the top of the Group tab.
- **#89 Automatic backups** (`app/api/backup`, `lib/backup.ts`, `vercel.json` cron Mondays 07:17 UTC): every Crumbs table → one gzipped JSON in the private `crumbs-backups` bucket, newest 8 kept (~a few hundred KB each now). Admin → Backups lists them (Download = 5-minute link) and has **Back up now**. Not included: photos (already files) and sign-in accounts (kept by the database host). Off until set up:
  1. Supabase → Project Settings → API → copy the **service_role** key → Vercel → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` (Production only; never `NEXT_PUBLIC_`).
  2. Vercel → add `CRON_SECRET` = any long random string (Vercel sends it to the scheduled job).
  3. Redeploy. Uses 1 of the 2 free scheduled jobs on the Hobby plan, ~4 runs a month.
  - Restoring: download the file, unzip, and insert table by table in the SQL editor (ask Claude to turn a backup into SQL).
- **#80 Photos on Cloudflare R2 — ready, off by default** (`app/api/photos`, `lib/photos.ts`, new dependency `aws4fetch`): when the settings below exist, NEW photos go to R2 (10 GB free, no download fees) and are saved as `r2/<group>/<id>.jpg`; existing photos stay in Supabase and keep working. Upload links last 10 minutes and are only given for groups you're in; deletes are checked the same way. Turn on when the Admin storage meter passes ~80%:
  1. Cloudflare → R2 → create bucket (e.g. `crumbs-photos`) → Settings → Public access: connect a custom domain or enable the r2.dev URL.
  2. Bucket → Settings → CORS policy: allow `PUT` from your Crumbs site (e.g. `https://crumbs-shared-food-rating-app.vercel.app`) with header `content-type`.
  3. R2 → Manage API tokens → create token with Object Read & Write for that bucket.
  4. Vercel env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `NEXT_PUBLIC_R2_PUBLIC_URL` (the bucket's public URL). Redeploy.
- Tests 73/73; SQL loads twice (bucket + admin read policy + cover column); build passes; demo clean.

## Round 23 - import from other apps (#87, covers #28) (Oct 24, Claude in Cowork)
Aidan: approved the import plan; the "where do I get my file" help may name the apps.
- **Settings → Bring your places → Import places** (own full page, `components/import-places.tsx`). Choose a file or paste a list:
  - **Maps-app data export** (.zip straight from the export, or the files inside): saved lists (CSV: Title, Note, URL — each list keeps its name), starred places and **your reviews** (GeoJSON: name, address, location, your stars, review text, date). Several layouts handled; needs checking against a real export.
  - **Any spreadsheet as CSV** with a Name column (Address, City, Lat/Lng, Rating in any style — 4, 4.5, 8/10, 85, ★★★ — Notes, Date, Status optional).
  - **Pasted list**, one a line ("Hana Ramen, Toronto - 4/5").
- Read on the phone (`lib/importers.ts`, `fflate` for .zip, max 500 places a go, duplicates merged). Each place is matched (`lib/import-match.ts`): Crumbs' own restaurants first, then the free open-map search (~1 a second, its own bigger allowance; can stop part-way). Sure = good name match within ~200 m (or one exact name when the file has no location); otherwise "to check" with up to 3 choices, or "not found".
- Review: tick what to add; **Add them as** As in the file (rated/visited → Been) / Want to try / Been; **Bring my ratings and notes** (→ your rating, half stars kept); **Keep my lists** (creates lists with the same names). Visit dates become visits. Places the group already has are skipped. No paid lookups are used.
- New dependency `fflate` (unzip, ~8 KB). Tests 81/81; build passes; demo import of a sample export (3 saved + 2 reviews) works.

## Round 24 - private notes (#10), draft ratings (#12), "Been a while" (#33) (Oct 24, Claude in Cowork)
Aidan: add 10, 12 and 33.
- **#10 Private notes** (`place_private_notes`, `components/private-note.tsx`): under "Your notes" on a place, "🔒 Add a private note (only you see it)". Only your own rows are readable (not your group, not admins); saved when you leave the box, empty deletes it. In backups; not in group downloads.
- **#12 Draft ratings** (`place_ratings.draft`): before your first rating on a place, tick "Save my rating as a draft". Drafts are hidden from everyone else by the database (read rule), make no feed line or notification, and aren't copied to your other groups. A banner "📝 Draft — only you can see your rating · Post it" posts it (then the feed line, notification and sharing happen). Your own view of the group average includes your draft.
- **#33 Been a while** (`beenAWhile` in `lib/smart-lists.ts`): places you liked (3.5★+) and last visited 3+ months ago. New smart list 🕰️ Been a while (longest first) and a card on Decide & Plan with the top 3 ("Last time 7 months ago — you loved it").
- Tests 82/82; SQL tested (draft hidden from others, no feed line until posted, private notes own-only, non-members can't add notes); build passes; demo clean.

## Round 25 - Crumbs Wrapped (#61) (Oct 24, Claude in Cowork)
Aidan: no hot take one-liner (#9 = No); do Wrapped now.
- **Profile → Wrapped** (new round button, `components/wrapped.tsx`, `lib/wrapped.ts`): your group's year in food as full-screen story cards — tap right for next, left for back (arrow keys too), progress bars on top, round ✕ to close, a new colour each card, numbers count up (off with Animations off).
- Cards (only the ones with data): the year · meals out + places + how many were new · busiest month · longest weekly streak · cuisines + top cuisine · your regular · favourite of the year · dish of the year · spend + $/person + splurge month · home cooking + top meal · date nights / takeout · you rated N places, your average + taste match.
- **Summary card** with Share (phone share sheet with a 1080×1920 picture) and Save image. Year chips when you have more than one year; in January/February it opens on last year.
- **Decide & Plan teaser** "🎁 Your 2026 Wrapped" from December to February.
- Built on the phone from your own data (blind ratings respected) — free, nothing stored or sent. Tests 83/83; build passes; demo tour clean.

## Round 26 - keeping Crumbs healthy (#163 #164 #169–173 #226) (Oct 25, Claude in Cowork)
Aidan's decisions on ideas #112–235 recorded in the backlog. This round: the behind-the-scenes Yes items.
- **One daily job** (`app/api/daily`, `vercel.json` now daily 07:17 UTC): #173 a tiny read every day so the database never sleeps after a quiet week (works even without CRON_SECRET); #172 checks free limits via `limit_report()` (database vs 500 MB, photos vs 1 GB, every spending budget) and writes `admin_alerts` (warn at 80% / daily 90%, stop at 95–100%, "on pace for" info); new warnings push to admins' phones when push keys are set; #89 the weekly backup now runs from here on Mondays (`lib/run-backup.ts`).
- **#226 Spending guard forecast**: "At this pace ~X by month end" under each monthly bar, red if it would hit the limit.
- **Admin → Data quality**: alerts (Dismiss), #169 possible duplicates (same name within ~150 m) with **Merge** (#170 `merge_restaurants`: keeps the owner-verified or more-saved copy; places, dishes, ✓/✕ votes, details, claims, managers and points move over, gaps filled), #171 "Busy in the last day" with each person's "% backed".
- **#171 Anti-spam**: daily caps 60 details / 200 checks / 60 prices per person (owners exempt for their own place); `user_trust` = share of someone's details later backed by others; below 30% (after 5) their details wait for two people to agree.
- **#163 Home-screen shortcuts** (long-press the icon): Log a visit, Add a place. **#164 Share to Crumbs**: share a map link or a place name from another app → Add a place opens with it filled in (map links are read straight away).
- Tests 88/88; SQL tested (dupes admin-only, merge, caps, trust, limit report); build passes; share flow checked in demo.
