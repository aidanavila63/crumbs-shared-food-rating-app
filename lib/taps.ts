// O3 (Round 89): count a tap on an owner-verified restaurant page (Call, Website, Directions,
// Book, Menu, Table menu). Fire and forget; once per page and kind per visit (the database also
// keeps it to once a day per person). Signed-out visitors are counted by a random id this browser
// keeps — never anything about them. Does nothing in demo mode or if the database isn't ready.
import type { TapKind } from './owner-tools.ts'

const sent = new Set<string>()
const KEY = 'crumbs-visitor'

export function visitorId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return null
  }
}

export function countTap(restaurantId: string | null | undefined, kind: TapKind, claimed: boolean | undefined) {
  if (!restaurantId || !claimed || process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return
  const key = `${restaurantId}:${kind}`
  if (sent.has(key)) return
  sent.add(key)
  const visitor = visitorId()
  import('./supabase')
    .then(({ createClient }) =>
      createClient().rpc('count_tap', { target: restaurantId, what: kind, visitor }),
    )
    .catch(() => {})
}
