import { createClient } from '@/lib/supabase/server'
import { tooManyRequests } from '@/lib/rate-limit'
import { OSM_UA, cleanWebsite, cuisineFromTag } from '@/lib/osm'

// Best-effort extra details (website, cuisine) for one picked OpenStreetMap place.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  if (tooManyRequests(`osm-place:${data.user.id}`, 30))
    return Response.json({ error: 'Too many requests, wait a moment' }, { status: 429 })

  const params = new URL(request.url).searchParams
  const type = params.get('type') ?? ''
  const id = params.get('id') ?? ''
  if (!/^[NWR]$/.test(type) || !/^\d{1,15}$/.test(id))
    return Response.json({ error: 'Bad place' }, { status: 400 })
  try {
    const url = new URL('https://nominatim.openstreetmap.org/lookup')
    url.searchParams.set('osm_ids', `${type}${id}`)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('extratags', '1')
    const response = await fetch(url, {
      headers: { 'user-agent': OSM_UA },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return Response.json({ website: null, cuisine: null })
    const [item] = await response.json()
    const tags = item?.extratags ?? {}
    return Response.json({
      website: cleanWebsite(tags.website ?? tags['contact:website']),
      cuisine: cuisineFromTag(tags.cuisine),
    })
  } catch {
    return Response.json({ website: null, cuisine: null })
  }
}
