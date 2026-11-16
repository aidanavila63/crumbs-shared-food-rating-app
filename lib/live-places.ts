// E1–E3 (Round 77): live updates change only the place that changed. A rating, visit, detail or
// dish from someone else re-reads that one place instead of the whole group (which, for a big
// group, was every place with all its ratings and dishes — megabytes — on every tap anyone made).
// Pure helpers: tests/live-places.test.ts.

type PlaceLike = { id: string; pinned?: boolean | null; created_at?: string | null; dishes?: { id: string }[] | null }

/** Which place a change belongs to, or null when it can't be told (then: reload everything). */
export function placeOfChange(table: string, payload: any, places: PlaceLike[]): string | null {
  const row = payload?.new && Object.keys(payload.new).length ? payload.new : payload?.old ?? {}
  if (table === 'places') return row.id ?? null
  if (row.place_id) return row.place_id
  const dishId = table === 'dishes' ? row.id : table === 'dish_ratings' ? row.dish_id : null
  if (dishId) return places.find((p) => p.dishes?.some((d) => d.id === dishId))?.id ?? null
  return null
}

/** Same order as the full load: pinned first, then newest first. */
export function placeOrder(a: PlaceLike, b: PlaceLike) {
  return Number(!!b.pinned) - Number(!!a.pinned) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
}

/** Puts freshly read places into the list: changed ones replaced, new ones added, gone ones removed. */
export function mergePlaces<T extends PlaceLike & { group_id?: string }>(
  current: T[],
  asked: string[],
  fresh: T[],
  groupId: string,
): T[] {
  const byId = new Map(fresh.filter((p) => !p.group_id || p.group_id === groupId).map((p) => [p.id, p]))
  const kept = current
    .filter((p) => !asked.includes(p.id) || byId.has(p.id))
    .map((p) => byId.get(p.id) ?? p)
  const added = [...byId.values()].filter((p) => !current.some((c) => c.id === p.id))
  return [...added, ...kept].sort(placeOrder)
}

/** Many places at once (an import, a reconnect): cheaper to reload the group. */
export const MAX_PLACES_LIVE = 8
