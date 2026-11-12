// Round 75: your private places (only you) and a group's shared locations (everyone in the group),
// side by side in the "Near…" picker. Pure helpers, tested in tests/areas.test.ts.
import { distanceKm } from './stats.ts'

export type AreaLike = { name: string; lat: number; lng: number; km: number }
export type AreaChoice = { key: string; name: string; shared: boolean; area: AreaLike }

/** One of your private places within ~100 m of this spot (so it is never shared by accident). */
export function privatePlaceNear<T extends AreaLike>(spot: { lat: number; lng: number }, mine: T[]): T | null {
  return mine.find((area) => distanceKm(area, spot) <= 0.1) ?? null
}

/** Everything the picker offers: the group's locations first, then yours. Keys never clash. */
export function areaChoices(mine: AreaLike[], shared: (AreaLike & { id: string })[]): AreaChoice[] {
  return [
    ...shared.map((area) => ({ key: `group:${area.id}`, name: area.name, shared: true, area: { ...area, km: Number(area.km) } })),
    ...mine.map((area) => ({ key: `me:${area.name}`, name: area.name, shared: false, area })),
  ]
}

/** Where a search should start when the phone has no location: the group's first location. */
export function groupAnchor(shared: AreaLike[]): { lat: number; lng: number } | null {
  const first = shared[0]
  return first ? { lat: first.lat, lng: first.lng } : null
}
