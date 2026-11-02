// #36 "Loved X → try Y": recommendations from your own places (free, on the phone) plus
// OpenStreetMap discovery of new spots with the same cuisine (free Overpass API).
import type { Place } from '../hooks/use-crumbs-data'
import { average5 } from './ratings.ts'
import { distanceKm } from './stats.ts'

export type Recommendation = { loved: Place; tries: { place: Place; km: number | null }[] }

const key = (cuisine: string | null) => (cuisine ?? '').trim().toLowerCase()
const where = (p: Place) =>
  p.latitude !== null && p.longitude !== null ? { lat: p.latitude, lng: p.longitude } : null

/** For each place you loved (4★+), want-to-try places with the same cuisine, nearest first. */
export function lovedToTry(places: Place[], limit = 3): Recommendation[] {
  const wish = places.filter(
    (p) => p.status === 'Want to try' && p.business_status !== 'CLOSED_PERMANENTLY',
  )
  return places
    .filter((p) => p.status === 'Been' && p.cuisine && average5(p.place_ratings) >= 4)
    .sort((a, b) => average5(b.place_ratings) - average5(a.place_ratings))
    .map((loved) => {
      const from = where(loved)
      const tries = wish
        .filter((p) => key(p.cuisine) === key(loved.cuisine))
        .map((place) => {
          const to = where(place)
          return { place, km: from && to ? distanceKm(from, to) : null }
        })
        .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
        .slice(0, 3)
      return { loved, tries }
    })
    .filter((rec) => rec.tries.length)
    .slice(0, limit)
}

/** OSM cuisine tag for one of our cuisine names ("Middle Eastern" → "middle_eastern"). */
export function osmCuisine(cuisine: string) {
  return cuisine
    .trim()
    .toLowerCase()
    .replace(/ (restaurant|food|cuisine)$/, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 30)
}

/** Overpass query: food places with that cuisine within `radius` metres. */
export function overpassQuery(lat: number, lon: number, cuisine = '', radius = 2000) {
  const c = cuisine ? osmCuisine(cuisine) : ''
  const byCuisine = c ? `["cuisine"~"(^|;)${c}($|;)",i]` : ''
  const amenity = c
    ? 'restaurant|fast_food|cafe|food_court'
    : 'restaurant|fast_food|cafe|food_court|bar|pub|ice_cream'
  return `[out:json][timeout:10];nwr["amenity"~"^(${amenity})$"]${byCuisine}["name"](around:${Math.min(5000, Math.max(200, radius))},${lat.toFixed(5)},${lon.toFixed(5)});out center ${c ? 25 : 60};`
}

export function overpassToPlaces(json: any) {
  return ((json?.elements ?? []) as any[])
    .map((el) => {
      const t = el.tags ?? {}
      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      if (!t.name || typeof lat !== 'number' || typeof lon !== 'number') return null
      const type = el.type === 'way' ? 'W' : el.type === 'relation' ? 'R' : 'N'
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
      return {
        google_place_id: `osm:${type}${el.id}`,
        name: String(t.name).slice(0, 120),
        formatted_address: [street, t['addr:city']].filter(Boolean).join(', ') || null,
        latitude: lat,
        longitude: lon,
        price_level: null,
        cuisine: t.cuisine
          ? String(t.cuisine)
              .split(';')[0]
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (m: string) => m.toUpperCase())
          : null,
        website: typeof t.website === 'string' && /^https?:\/\//.test(t.website) ? t.website : null,
        google_maps_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      }
    })
    .filter(Boolean)
}
