// Round 96: Explore keeps the nearest new spots only (fewer pins = a lighter, steadier map).
type Spot = { latitude: number; longitude: number }

const km = (a: { lat: number; lng: number }, b: Spot) => {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.lat) * rad
  const dLng = (b.longitude - a.lng) * rad * Math.cos(((a.lat + b.latitude) / 2) * rad)
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371
}

/** The `max` spots nearest the centre, within `withinKm` (spots further out are dropped). */
export function nearestSpots<T extends Spot>(spots: T[], center: { lat: number; lng: number }, max = 40, withinKm = 2.5): T[] {
  return spots
    .map((s) => ({ s, d: km(center, s) }))
    .filter((x) => Number.isFinite(x.d) && x.d <= withinKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.s)
}
