// #216 City passport: a stamp for every city you've eaten in (from the place's address, or the
// trip it was saved under). Worked out on the phone.
import type { List, Place } from '../hooks/use-crumbs-data'
import { allVisits } from './stats.ts'

const COUNTRIES =
  /^(canada|usa|united states( of america)?|us|uk|united kingdom|mexico|france|italy|spain|japan|germany|portugal|australia|ireland)$/i

/** "123 Queen St W, Toronto, ON M5H 2N2, Canada" → "Toronto". Null when there's no clear city. */
export function cityOf(address: string | null | undefined) {
  if (!address) return null
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const candidates = parts
    .slice(1) // the first part is the street
    .filter((p) => !COUNTRIES.test(p))
    .filter((p) => !/\d/.test(p)) // postal codes, "ON M5H 2N2", "CA 94110"
    .filter((p) => !/^[A-Z.]{2,5}$/.test(p)) // state / province codes (ON, CA, Q.R.)
  const city = candidates.at(-1) ?? null
  return city && city.length <= 40 ? city : null
}

export type Stamp = { city: string; first: string; visits: number; places: number }

export function passport(places: Place[], lists: List[] = []) {
  const tripCity = new Map<string, string>()
  for (const l of lists)
    if (l.trip_city) for (const lp of l.list_places ?? []) tripCity.set(lp.place_id, l.trip_city)
  const stamps = new Map<string, Stamp & { ids: Set<string> }>()
  for (const v of allVisits(places)) {
    const city = tripCity.get(v.place.id) ?? cityOf(v.place.formatted_address)
    if (!city) continue
    const key = city.toLowerCase()
    const s = stamps.get(key) ?? {
      city,
      first: v.visited_on,
      visits: 0,
      places: 0,
      ids: new Set<string>(),
    }
    s.visits += 1
    if (!s.ids.has(v.place.id)) {
      s.ids.add(v.place.id)
      s.places += 1
    }
    if (v.visited_on < s.first) s.first = v.visited_on
    stamps.set(key, s)
  }
  return [...stamps.values()]
    .map(({ ids, ...s }) => (void ids, s))
    .sort((a, b) => a.first.localeCompare(b.first))
}
