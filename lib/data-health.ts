// Admin data-health: how complete each fact is across saved restaurants, and who provided it.
export type HealthRow = {
  fact: string
  total: number
  filled: number
  owner: number
  crumbs: number
  site: number
  osm: number
  google: number
}

export const FACT_LABEL: Record<string, string> = {
  hours: 'Opening hours',
  phone: 'Phone',
  website: 'Website',
  cuisine: 'Cuisine',
  price_level: 'Price level',
  address: 'Address',
}

/** Whole-number percent filled (0 when there are no restaurants). */
export const filledPct = (r: Pick<HealthRow, 'total' | 'filled'>) =>
  r.total > 0 ? Math.round((r.filled / r.total) * 100) : 0

/** Source split in display order, empty sources left out. Percentages are of filled facts. */
export function sourceSplit(r: HealthRow) {
  const parts: [string, number][] = [
    ['Owner', r.owner],
    ['Members', r.crumbs],
    ['Website', r.site],
    ['OpenStreetMap', r.osm],
    ['Google', r.google],
  ]
  return parts
    .filter(([, n]) => n > 0)
    .map(([label, n]) => ({ label, n, pct: r.filled > 0 ? Math.round((n / r.filled) * 100) : 0 }))
}
