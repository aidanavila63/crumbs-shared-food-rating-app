# Overture import (Round 79)

Decided Nov 12: food places for the whole GTA from [Overture Maps](https://overturemaps.org)
(open data, CDLA Permissive 2.0) become Crumbs' own base layer. Imported restaurants show up in
search and "nearby" only; pins are still only the places groups save.

**Not run yet.** The workspace that builds Crumbs couldn't reach Overture's servers. Once these
hosts are allowed (claude.ai → Settings → Capabilities): `overturemaps.org`,
`stac.overturemaps.org`, `overturemaps-us-west-2.s3.amazonaws.com`, Claude can make the file.

1. **Make the file** (about 15–40k rows): `duckdb < scripts/overture/gta-food.sql` → `overture-gta-food.csv`.
   Set the newest release in the file first (docs.overturemaps.org → Releases).
2. **Load it**, either
   - Supabase → Table Editor → `overture_places` → Insert → Import data from CSV, or
   - `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/overture/load.mjs overture-gta-food.csv`
3. **Merge**: Admin → Overture → "Merge the next 2,000" until nothing is waiting. A place Crumbs
   already has (same name within 80 m) only gets its empty details filled; nothing members, owners
   or a restaurant's website gave is ever replaced.
4. **Credit**: the Credits page lists Overture once the first import is in.
5. **Monthly refresh**: repeat with the new release; existing rows are kept, new ones merged.
