import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { OSM_UA } from '@/lib/osm'
import { overpassQuery, overpassToPlaces } from '@/lib/nearby'

// #36 Discover places near a spot you loved, from OpenStreetMap (free; no Google calls).
// Results are cached per area + cuisine for a day so repeat looks don't hit Overpass again.
const cache = new Map<string, { at: number; results: unknown[] }>()

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const cuisine = (params.get('cuisine') ?? '').trim().slice(0, 40)
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !cuisine
  )
    return Response.json({ error: 'Need a location and a cuisine' }, { status: 400 })
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${cuisine.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 864e5) return Response.json({ results: hit.results })
  if (tooManyRequests(`nearby:${data.user.id}`, 10))
    return Response.json(
      { error: 'Slow down a little and try again in a few minutes' },
      { status: 429 },
    )
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': OSM_UA },
      body: new URLSearchParams({ data: overpassQuery(lat, lon, cuisine) }),
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) throw new Error(`Overpass ${response.status}`)
    const results = overpassToPlaces(await response.json())
    if (cache.size > 500) cache.clear()
    cache.set(key, { at: Date.now(), results })
    return Response.json({ results })
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'Could not reach OpenStreetMap' },
      { status: 502 },
    )
  }
}
