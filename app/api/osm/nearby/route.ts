import { createClient } from '@/lib/supabase/server'
import { overDailyLimit } from '@/lib/tier-limits'
import { tooManyRequests } from '@/lib/rate-limit'
import { overpass } from '@/lib/osm'
import { overpassQuery, overpassToPlaces } from '@/lib/nearby'

// #36 Discover places near a spot you loved, from OpenStreetMap (free; no Google calls).
// Results are cached per area + cuisine for a day so repeat looks don't hit Overpass again.
const cache = new Map<string, { at: number; results: unknown[] }>()

// Up to three free servers are tried (about 8 s each).
export const maxDuration = 30

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const cuisine = (params.get('cuisine') ?? '').trim().slice(0, 40)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return Response.json({ error: 'Need a location' }, { status: 400 })
  // Without a cuisine this is "Explore": everything to eat within ~1.2 km (#36 on the map).
  const radius = cuisine ? 2000 : 1200
  const key = `${lat.toFixed(cuisine ? 2 : 3)},${lon.toFixed(cuisine ? 2 : 3)},${cuisine.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 864e5) return Response.json({ results: hit.results })
  // Fresh lookups use the daily Explore allowance (more for contributors).
  const capped = await overDailyLimit(supabase, data.user.id, 'explore')
  if (capped) return Response.json({ error: capped }, { status: 429 })
  if (tooManyRequests(`nearby:${data.user.id}`, 10))
    return Response.json(
      { error: 'Slow down a little and try again in a few minutes' },
      { status: 429 },
    )
  try {
    const json = await overpass(overpassQuery(lat, lon, cuisine, radius))
    const results = overpassToPlaces(json)
    if (cache.size > 500) cache.clear()
    cache.set(key, { at: Date.now(), results })
    return Response.json({ results })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Could not load nearby places' },
      { status: 502 },
    )
  }
}
