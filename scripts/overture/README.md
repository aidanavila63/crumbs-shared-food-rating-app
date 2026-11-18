# Overture import

Decided Nov 12: food places for the whole GTA from [Overture Maps](https://overturemaps.org)
(open data, CDLA Permissive 2.0) become Crumbs' own base layer. Imported restaurants show up in
search and "nearby" only; pins are still only the places groups save.

**First file made Nov 18 (Round 89)** from release `2026-10-21.0`: 26,526 GTA food places.

1. **Make the file**: `pip install pyarrow requests`, then `python3 scripts/overture/gta_food.py`
   → `overture-gta-food.csv` (newest release; or pass one, e.g. `2026-10-21.0`). It reads only the
   GTA parts of Overture's files over HTTPS (about 50 MB, under a minute). No DuckDB or AWS
   account needed. Kept: Overture's `food_and_drink` places, confidence ≥ 0.6, not permanently
   closed, in Canada, inside Hamilton/Burlington – Oshawa, Lake Ontario – Newmarket. Listing and
   delivery sites (Yelp, DoorDash, Facebook…) are not kept as a restaurant's website.
2. **Load it**, either
   - Supabase → Table Editor → `overture_places` → Insert → Import data from CSV, or
   - `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/overture/load.mjs overture-gta-food.csv`
   (Empty cells become nothing, not empty text: Round 89's `overture_places_tidy`.)
3. **Merge**: Admin → Overture → "Merge the next …" until nothing is waiting (10,000 a tap,
   1,000 per database call). A place Crumbs already has (same name within 80 m) only gets its
   empty details filled; nothing members, owners or a restaurant's website gave is ever replaced.
4. **Credit**: the Credits page lists Overture (added in Round 89).
5. **Monthly refresh**: repeat with the new release; existing rows are kept, new ones merged.

Overture changed its places schema in 2025: `categories` is gone, the kind of place is now
`taxonomy.primary` (e.g. `barbecue_restaurant`) with `taxonomy.hierarchy[0] = 'food_and_drink'`.
`overture_cuisine()` (Round 89) turns those into Crumbs' cuisine words.
