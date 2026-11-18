import { createClient } from '@/lib/supabase/server'
import { overDailyLimit } from '@/lib/tier-limits'
import { tooManyRequests } from '@/lib/rate-limit'
import { overpass } from '@/lib/osm'
import { OWN_ENOUGH, mergeNearby, overpassQuery, overpassToPlaces, ownToPlaces } from '@/lib/nearby'
import { gate } from '@/lib/server-gate'
import { keepErrors } from '@/lib/server-errors'

// #36 Discover places near a spot you loved: Crumbs' own restaurants first (Round 79), then
// OpenStreetMap (free; no Google calls) when there aren't enough.
// Results are cached per area + cuisine for a day so repeat looks don't hit Overpass again.
const cache = new Map<string, { at: number; results: unknown[] }>()

// The free servers are asked together (up to 12 s).
export const maxDuration = 20

async function handleGET(request: Request) {
  const supabase = await createClient()
  // E17 (Round 86): signed in + let in (+ switch) in one go
  const pass = await gate(supabase)
  if ('response' in pass) return pass.response
  const data = { user: { id: pass.userId } }
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const cuisine = (params.get('cuisine') ?? '').trim().slice(0, 40)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return Response.json({ error: 'Need a location' }, { status: 400 })
  // Without a cuisine this is "Explore": everything to eat within ~1.2 km (#36 on the map).
  const radius = cuisine ? 2000 : 1200
  const key = `${lat.toFixed(cuisine ? 2 : 3)},${lon.toFixed(cuisine ? 2 : 3)},${cuisine.toLowerCase()}`
  // Round 79: Crumbs' own restaurants first (no allowance used, no outside call).
  const { data: mine, error: ownError } = await supabase.rpc('restaurants_near', {
    lat,
    lng: lon,
    km: radius / 1000,
    q: cuisine || null,
    lim: 60,
  })
  const own = ownError ? [] : ownToPlaces(mine as any[])
  if (own.length >= OWN_ENOUGH) return Response.json({ results: own, source: 'crumbs' })
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 864e5)
    return Response.json({ results: mergeNearby(own, hit.results as any[]) })
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
    return Response.json({ results: mergeNearby(own, results as any[]) })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Could not load nearby places' },
      { status: 502 },
    )
  }
}

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const GET = keepErrors('GET /api/osm/nearby', handleGET)
