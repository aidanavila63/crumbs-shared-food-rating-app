import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { overpass } from '@/lib/osm'
import { bestMatch, matchQuery } from '@/lib/osm-match'

// Fills a shared restaurant profile with OpenStreetMap facts (address, phone, website, cuisine,
// hours) — data Crumbs may keep forever, unlike Google's. Runs once per restaurant every ~3 months.
// Up to three free servers are tried (about 8 s each).
export const maxDuration = 30

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(`osm-match:${data.user.id}`, 20))
    return Response.json({ error: 'Slow down a little' }, { status: 429 })
  const { restaurantId, utc } = await request.json().catch(() => ({}))
  if (typeof restaurantId !== 'string')
    return Response.json({ error: 'Missing restaurant' }, { status: 400 })
  const { data: r } = await supabase
    .from('restaurants')
    .select('id,name,latitude,longitude,opening_hours,osm_checked_at')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!r || r.latitude === null || r.longitude === null)
    return Response.json({ error: 'Restaurant has no location' }, { status: 404 })
  if (r.osm_checked_at && Date.now() - new Date(r.osm_checked_at).getTime() < 90 * 864e5)
    return Response.json({ matched: null, skipped: true })
  const offset = Number.isFinite(r.opening_hours?.utc) ? r.opening_hours.utc : Number(utc) || 0
  let match = null
  try {
    const json = await overpass(matchQuery(r.latitude, r.longitude))
    match = bestMatch(json, r.name, offset)
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Map data unavailable' }, { status: 502 })
  }
  // Record the check even when there's no match, so we don't ask again for a while.
  const { error } = await supabase.rpc('merge_open_data', {
    target: r.id,
    data: match?.data ?? {},
    osm: match?.osm ?? null,
  })
  if (error) return Response.json({ error: error.message }, { status: 403 })
  return Response.json({ matched: match?.osm ?? null, fields: Object.keys(match?.data ?? {}) })
}
