import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { OSM_UA, isFoodFeature, photonToPlace } from '@/lib/osm'

const TAGS = [
  'amenity:restaurant',
  'amenity:cafe',
  'amenity:fast_food',
  'amenity:bar',
  'amenity:pub',
  'amenity:food_court',
  'amenity:ice_cream',
  'shop:bakery',
]

async function photon(q: string, lat: string | null, lon: string | null, tagged: boolean) {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', tagged ? '6' : '15')
  url.searchParams.set('lang', 'en')
  if (lat && lon && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lon))) {
    url.searchParams.set('lat', lat)
    url.searchParams.set('lon', lon)
  }
  if (tagged) TAGS.forEach((tag) => url.searchParams.append('osm_tag', tag))
  const response = await fetch(url, {
    headers: { 'user-agent': OSM_UA },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`Photon ${response.status}`)
  const json = await response.json()
  return (json.features ?? []) as any[]
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(`osm:${data.user.id}`, 60))
    return Response.json({ error: 'Too many searches, wait a moment' }, { status: 429 })

  const params = new URL(request.url).searchParams
  const q = (params.get('q') ?? '').trim().slice(0, 120)
  if (q.length < 3) return Response.json({ results: [] })
  try {
    let features = await photon(q, params.get('lat'), params.get('lon'), true)
    if (!features.length) {
      // Some Photon versions treat several osm_tag filters differently; filter ourselves instead.
      features = (await photon(q, params.get('lat'), params.get('lon'), false)).filter((feature) =>
        isFoodFeature(feature.properties),
      )
    }
    const results = features
      .map(photonToPlace)
      .filter((place): place is NonNullable<typeof place> => Boolean(place))
      .slice(0, 6)
    return Response.json({ results })
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Search failed' }, { status: 502 })
  }
}
