// U2 (Round 87): "You're at Hana Ramen" — when the phone already knows where you are (no popup is
// ever shown for this) and you're standing at a place saved in this space.
import { distanceKm } from './stats.ts'

export const HERE_METRES = 120

type Spot = { id: string; latitude: number | null; longitude: number | null; status?: string }

/** The saved place you're at (closest within HERE_METRES), or null. */
export function placeHere<T extends Spot>(
  places: T[],
  at: { lat: number; lng: number } | null,
): T | null {
  if (!at) return null
  let best: T | null = null
  let bestKm = HERE_METRES / 1000
  for (const place of places) {
    if (place.latitude === null || place.longitude === null) continue
    const km = distanceKm(at, { lat: place.latitude, lng: place.longitude })
    if (km <= bestKm) {
      best = place
      bestKm = km
    }
  }
  return best
}
