// #87 Import: finds each imported item's real restaurant (Crumbs' own list first, then open map
// data — both free) and saves the chosen ones to the group with ratings, notes, visits and lists.
import type { List, Place } from '../hooks/use-crumbs-data'
import { addFoundPlace, notYetSaved, type FoundSpot } from './add-found.ts'
import type { ImportItem } from './importers.ts'
import { nameMatch } from './osm-match.ts'
import { searchRestaurants } from './restaurants.ts'
import { distanceKm } from './stats.ts'
import { fromInput } from './ratings.ts'

export type Match = {
  item: ImportItem
  state: 'matched' | 'pick' | 'missing'
  found: FoundSpot | null
  options: FoundSpot[]
}

type Near = { lat: number; lng: number } | null

/** Same place? A good name match and (when we know where it is) within ~200 m. */
export function sameSpot(item: ImportItem, spot: FoundSpot) {
  const score = nameMatch(item.name, spot.name)
  if (item.lat != null && item.lng != null) {
    const meters =
      distanceKm({ lat: item.lat, lng: item.lng }, { lat: spot.latitude, lng: spot.longitude }) *
      1000
    return score >= 0.6 && meters <= 200
  }
  return score >= 0.85
}

/** Sorts candidates best first, and says whether the best one is sure enough to use without asking. */
export function decide(
  item: ImportItem,
  candidates: FoundSpot[],
): Pick<Match, 'state' | 'found' | 'options'> {
  const good = candidates.filter((c) => nameMatch(item.name, c.name) >= 0.5)
  const sure = good.filter((c) => sameSpot(item, c))
  if (item.lat != null && sure.length)
    return { state: 'matched', found: sure[0], options: good.slice(0, 3) }
  // No location in the file: only sure when exactly one place has that exact name.
  const exact = good.filter((c) => nameMatch(item.name, c.name) === 1)
  if (item.lat == null && exact.length === 1 && good.length === 1)
    return { state: 'matched', found: exact[0], options: good.slice(0, 3) }
  return good.length
    ? { state: 'pick', found: null, options: good.slice(0, 3) }
    : { state: 'missing', found: null, options: [] }
}

const fromRestaurant = (r: any): FoundSpot | null =>
  r.latitude == null
    ? null
    : {
        google_place_id: r.source_key,
        name: r.name,
        formatted_address: r.formatted_address,
        latitude: r.latitude,
        longitude: r.longitude,
        cuisine: r.cuisine,
        website: r.website,
        google_maps_url: r.google_maps_url,
      }

async function openMapSearch(query: string, near: Near): Promise<FoundSpot[]> {
  const url = new URL('/api/osm/search', window.location.origin)
  url.searchParams.set('q', query)
  url.searchParams.set('bulk', '1')
  if (near) {
    url.searchParams.set('lat', String(near.lat))
    url.searchParams.set('lon', String(near.lng))
  }
  const response = await fetch(url)
  if (response.status === 429) throw new Error('slow-down')
  if (!response.ok) return []
  return (await response.json()).results ?? []
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Matches one item. `near` = where to look when the file has no location (Home / you). */
export async function matchItem(supabase: any, item: ImportItem, near: Near): Promise<Match> {
  const where = item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : near
  const ours = (await searchRestaurants(supabase, item.name, where).catch(() => []))
    .map(fromRestaurant)
    .filter((x): x is FoundSpot => !!x)
  const first = decide(item, ours)
  if (first.state === 'matched') return { item, ...first }
  let open: FoundSpot[] = []
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      open = await openMapSearch([item.name, item.address].filter(Boolean).join(' '), where)
      break
    } catch {
      await pause(4000 * (attempt + 1)) // busy: wait and try again
    }
  }
  const second = decide(item, [...ours, ...open])
  return { item, ...second }
}

/** Matches everything, one at a time (gentle on the free open-map search), with progress. */
export async function matchAll(
  supabase: any,
  items: ImportItem[],
  near: Near,
  onProgress: (done: number, matches: Match[]) => void,
  cancelled: () => boolean = () => false,
) {
  const matches: Match[] = []
  for (const item of items) {
    if (cancelled()) break
    matches.push(await matchItem(supabase, item, near))
    onProgress(matches.length, matches)
    await pause(350)
  }
  return matches
}

export type ImportOptions = {
  status: Place['status'] | 'auto' // auto = Been when the file says so (rating/visit), else Want to try
  ratings: boolean
  lists: boolean
}

/** Saves the chosen matches. Skips places the group already has. Returns how many were added. */
export async function saveImports({
  supabase,
  demo,
  groupId,
  userId,
  places,
  lists,
  chosen,
  options,
  onProgress,
}: {
  supabase: any
  demo: boolean
  groupId: string
  userId: string
  places: Place[]
  lists: List[]
  chosen: { item: ImportItem; found: FoundSpot }[]
  options: ImportOptions
  onProgress?: (done: number) => void
}) {
  const added: Place[] = []
  const listIds = new Map(lists.map((l) => [l.name.trim().toLowerCase(), l.id]))
  const newLists: List[] = []
  let skipped = 0
  for (const [i, { item, found }] of chosen.entries()) {
    onProgress?.(i)
    if (!notYetSaved([found], [...places, ...added]).length) {
      skipped++
      continue
    }
    const rating = options.ratings && item.rating ? item.rating : null
    const been = !!(rating || item.visited_on || item.status === 'Been')
    const status = options.status === 'auto' ? (been ? 'Been' : 'Want to try') : options.status
    let place: Place
    try {
      place = await addFoundPlace({
        supabase,
        demo,
        groupId,
        userId,
        found,
        status,
        visitedOn: status === 'Been' ? (item.visited_on ?? null) : null,
      })
    } catch {
      skipped++
      continue
    }
    if (rating) {
      const { score, points } = fromInput(rating, 'half')
      const row = { place_id: place.id, user_id: userId, score, points, notes: item.notes ?? null }
      place = { ...place, place_ratings: [{ ...row, user_id: userId }] as any }
      if (!demo) {
        const { error } = await supabase.from('place_ratings').upsert(row)
        // Older database without the points column: keep the 1-5 score.
        if (error) await supabase.from('place_ratings').upsert({ ...row, points: undefined })
      }
    }
    if (status === 'Been' && item.visited_on && !demo)
      await supabase
        .from('place_visits')
        .insert({
          place_id: place.id,
          visited_on: item.visited_on,
          spend: null,
          created_by: userId,
        })
    if (options.lists && item.list) {
      const key = item.list.trim().toLowerCase()
      let listId = listIds.get(key)
      if (!listId) {
        if (demo) listId = crypto.randomUUID()
        else {
          const { data } = await supabase
            .from('lists')
            .insert({
              group_id: groupId,
              name: item.list.trim().slice(0, 60),
              emoji: '📥',
              created_by: userId,
            })
            .select('*,list_places(*)')
            .single()
          listId = data?.id
          if (data) newLists.push(data)
        }
        if (listId) listIds.set(key, listId)
      }
      if (listId && !demo)
        await supabase
          .from('list_places')
          .insert({ list_id: listId, place_id: place.id, added_by: userId })
    }
    added.push(place)
  }
  onProgress?.(chosen.length)
  return { added, skipped, newLists }
}
