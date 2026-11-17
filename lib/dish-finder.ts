// U1 (Round 82): one result of the dish finder (the find_dish database function).
export type DishHit = {
  id: string
  name: string
  name_local?: string | null
  dish: string
  price: number | null
  owner_ok: boolean
  confirms: number
  /** only when 3+ groups have it */
  groups: number | null
  rating: number | null
  distance_km: number | null
  city: string | null
  slug: string | null
}

/** "0.8 km · ✓ on the owner's menu · 4.6★ from 4 groups" */
export function dishFinderLine(
  hit: Pick<DishHit, 'distance_km' | 'owner_ok' | 'confirms' | 'groups' | 'rating'>,
) {
  const parts: string[] = []
  if (hit.distance_km != null)
    parts.push(
      hit.distance_km < 1
        ? `${Math.round(hit.distance_km * 1000)} m`
        : `${hit.distance_km.toFixed(1)} km`,
    )
  if (hit.owner_ok) parts.push('✓ on the owner’s menu')
  else if (hit.confirms > 0) parts.push(`confirmed by ${hit.confirms}`)
  if (hit.groups != null && hit.rating != null)
    parts.push(`${hit.rating.toFixed(1)}★ from ${hit.groups} groups`)
  return parts.join(' · ')
}
