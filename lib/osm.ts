// OpenStreetMap helpers (server side). Photon does the search, Nominatim fills in details.
export const OSM_UA = 'Crumbs/1.0 (private shared food-rating app)'

export type OsmPlace = {
  google_place_id: string
  name: string
  formatted_address: string | null
  latitude: number | null
  longitude: number | null
  price_level: number | null
  cuisine: string | null
  website: string | null
  google_maps_url: string | null
}

const FOOD_AMENITIES = new Set([
  'restaurant',
  'cafe',
  'fast_food',
  'bar',
  'pub',
  'food_court',
  'ice_cream',
  'biergarten',
])
const FOOD_SHOPS = new Set(['bakery', 'deli', 'pastry', 'confectionery', 'coffee'])

export function isFoodFeature(props: any) {
  return (
    (props?.osm_key === 'amenity' && FOOD_AMENITIES.has(props?.osm_value)) ||
    (props?.osm_key === 'shop' && FOOD_SHOPS.has(props?.osm_value))
  )
}

const KIND: Record<string, string> = { N: 'node', W: 'way', R: 'relation' }

export function osmUrl(type: string, id: number | string) {
  return `https://www.openstreetmap.org/${KIND[type] ?? 'node'}/${id}`
}

export function photonToPlace(feature: any): OsmPlace | null {
  const props = feature?.properties ?? {}
  const [lon, lat] = feature?.geometry?.coordinates ?? []
  if (!props.name || typeof lat !== 'number' || typeof lon !== 'number') return null
  const street = [props.housenumber, props.street].filter(Boolean).join(' ')
  const region = [props.state, props.postcode].filter(Boolean).join(' ')
  const address = [street, props.city ?? props.district, region, props.country]
    .filter(Boolean)
    .join(', ')
  return {
    google_place_id: `osm:${props.osm_type}${props.osm_id}`,
    name: props.name,
    formatted_address: address || null,
    latitude: lat,
    longitude: lon,
    price_level: null,
    cuisine:
      props.osm_value && props.osm_value !== 'restaurant' ? titleCase(props.osm_value) : null,
    website: null,
    google_maps_url: osmUrl(props.osm_type, props.osm_id),
  }
}

export function titleCase(text: string) {
  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function cleanWebsite(raw?: string | null) {
  if (!raw) return null
  const text = raw.trim()
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

// "afghan;kebab" -> "Afghan"
export function cuisineFromTag(tag?: string | null) {
  const first = tag?.split(';')[0]?.trim()
  return first ? titleCase(first) : null
}

// Free public copies of the same open map database. If the main one is busy or slow (it often is
// at peak times), the next one is tried, so a look-around rarely fails.
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

/**
 * Runs an Overpass query on all the free servers at once and takes the first good answer
 * (one slow server used to hold everything up for 8 s before the next was tried).
 */
export async function overpass(query: string): Promise<any> {
  const stop = new AbortController()
  const errors: string[] = []
  try {
    return await Promise.any(
      OVERPASS_SERVERS.map(async (server) => {
        try {
          const response = await fetch(server, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': OSM_UA },
            body: new URLSearchParams({ data: query }),
            signal: AbortSignal.any([stop.signal, AbortSignal.timeout(12_000)]),
          })
          if (!response.ok) throw new Error(`status ${response.status}`)
          const json = await response.json()
          stop.abort() // got one; cancel the others
          return json
        } catch (error: any) {
          errors.push(error?.name === 'TimeoutError' ? 'timeout' : error?.message || 'error')
          throw error
        }
      }),
    )
  } catch {
    throw new Error(
      errors.every((e) => e === 'timeout')
        ? 'The free map data took too long to answer. Try again in a minute.'
        : 'The free map data is busy right now. Try again in a minute.',
    )
  }
}
