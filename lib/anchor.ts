// Round 77 (decided Nov 12): Decide, Tonight, Surprise and Explore measure "near" from the group's
// main location; the owner (or an admin) picks which of the group's locations is main, and anyone
// can swap it for themselves for a while (kept on that phone until Crumbs is closed). Without any
// group location, it's your Home from Settings, as before. Pure helpers: tests/anchor.test.ts.
import type { AreaLike } from './areas.ts'

export type Point = { lat: number; lng: number }
export type Anchor = Point & { label: string; key: string }
/** 'auto' = the group's main location (or your Home); 'here' = where the phone is now. */
export type FromChoice = string

type Shared = AreaLike & { id: string }

/** The group's main location: the one chosen, else the first one added. */
export function mainLocation(locations: Shared[], mainId?: string | null): Shared | null {
  return locations.find((l) => l.id === mainId) ?? locations[0] ?? null
}

/** Where "near" is measured from, given the choice for this session. */
export function resolveFrom(
  choice: FromChoice,
  opts: {
    locations: Shared[]
    mainId?: string | null
    mine: AreaLike[]
    home: Point | null
    here: Point | null
  },
): Anchor | null {
  const { locations, mainId, mine, home, here } = opts
  if (choice === 'here') return here ? { ...here, label: 'Where I am', key: 'here' } : null
  if (choice === 'home') return home ? { ...home, label: 'Home', key: 'home' } : null
  if (choice.startsWith('group:')) {
    const l = locations.find((x) => `group:${x.id}` === choice)
    if (l) return { lat: l.lat, lng: l.lng, label: l.name, key: choice }
  }
  if (choice.startsWith('me:')) {
    const a = mine.find((x) => `me:${x.name}` === choice)
    if (a) return { lat: a.lat, lng: a.lng, label: a.name, key: choice }
  }
  const main = mainLocation(locations, mainId)
  if (main) return { lat: main.lat, lng: main.lng, label: main.name, key: `group:${main.id}` }
  return home ? { ...home, label: 'Home', key: 'home' } : null
}

const KEY = (groupId: string) => `crumbs-from-${groupId}`

/** This phone's swap for this group, until Crumbs is closed (sessionStorage). */
export function savedFrom(groupId: string): FromChoice {
  try {
    return sessionStorage.getItem(KEY(groupId)) || 'auto'
  } catch {
    return 'auto'
  }
}
export function saveFrom(groupId: string, choice: FromChoice) {
  try {
    if (choice === 'auto') sessionStorage.removeItem(KEY(groupId))
    else sessionStorage.setItem(KEY(groupId), choice)
  } catch {}
}
