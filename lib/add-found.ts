// Saves a place found on OpenStreetMap (Explore / "near a favourite") to the group's
// Want to try list, and links it to the shared restaurant profile.
import type { Place } from '../hooks/use-crumbs-data'
import { linkRestaurant } from './restaurants.ts'

export type FoundSpot = {
  google_place_id: string
  name: string
  formatted_address: string | null
  latitude: number
  longitude: number
  cuisine: string | null
  website: string | null
  google_maps_url: string | null
}

export async function addFoundPlace({
  supabase,
  demo,
  groupId,
  userId,
  found,
}: {
  supabase: any
  demo: boolean
  groupId: string
  userId: string
  found: FoundSpot
}): Promise<Place> {
  const row = {
    group_id: groupId,
    created_by: userId,
    name: found.name,
    formatted_address: found.formatted_address,
    latitude: found.latitude,
    longitude: found.longitude,
    price_level: null,
    cuisine: found.cuisine,
    website: found.website,
    google_maps_url: found.google_maps_url,
    google_place_id: found.google_place_id,
    status: 'Want to try' as const,
  }
  if (demo)
    return {
      ...row,
      id: crypto.randomUUID(),
      pinned: false,
      tags: [],
      created_at: new Date().toISOString(),
      place_ratings: [],
      dishes: [],
    }
  const { data, error } = await supabase
    .from('places')
    .insert(row)
    .select('*,place_ratings(*),place_visits(*),place_facts(*),dishes(*)')
    .single()
  if (error) throw error.code === '23505' ? new Error('Already on your list') : error
  let place: Place = { ...data, dishes: [] }
  try {
    const shared = await linkRestaurant(supabase, place.id)
    if (shared) place = { ...place, restaurant_id: shared.id }
  } catch {}
  return place
}

/** Drops spots the group already has (same OSM id, or same name close by). */
export function notYetSaved<T extends FoundSpot>(spots: T[], places: Place[]) {
  const ids = new Set(places.map((p) => p.google_place_id))
  return spots.filter(
    (s) =>
      !ids.has(s.google_place_id) &&
      !places.some(
        (p) =>
          p.name.trim().toLowerCase() === s.name.trim().toLowerCase() &&
          (p.latitude === null ||
            (Math.abs(p.latitude - s.latitude) < 0.003 &&
              Math.abs((p.longitude ?? 0) - s.longitude) < 0.004)),
      ),
  )
}
