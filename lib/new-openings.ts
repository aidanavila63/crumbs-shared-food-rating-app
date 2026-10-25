// #152 New openings near your favourites: once a week the phone looks around your top favourites on
// the free open map and remembers what it saw; anything not seen before is "🆕 New on the map".
const KEY = 'crumbs-seen-near'
const WEEK = 7 * 864e5

type Seen = { at: number; ids: string[] }
function read(): Record<string, Seen> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Ids that weren't there last time (nothing is "new" the very first time we look). */
export function newSince(previous: string[] | null | undefined, now: string[]) {
  if (!previous) return []
  const before = new Set(previous)
  return now.filter((id) => !before.has(id))
}

export function seenNear(placeId: string): Seen | null {
  return read()[placeId] ?? null
}

/** Remembers what's around a favourite now; returns the ones that are new since last time. */
export function rememberNear(placeId: string, ids: string[], now = Date.now()) {
  const all = read()
  const fresh = newSince(all[placeId]?.ids, ids)
  all[placeId] = { at: now, ids: [...new Set([...(all[placeId]?.ids ?? []), ...ids])].slice(-300) }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
  return fresh
}

/** Time for this week's look? */
export function dueNear(placeId: string, now = Date.now()) {
  const s = read()[placeId]
  return !s || now - s.at > WEEK
}
