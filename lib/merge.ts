// U13 (Round 95): which other places in the group might be the same one — same name (ignoring
// capitals, accents, "the", punctuation) or within 100 m — first, then the rest by name.
import type { Place } from '../hooks/use-crumbs-data'

export const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(the|restaurant|cafe|bar)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')

function metres(a: Place, b: Place) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Infinity
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLng = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad)
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6_371_000
}

export function duplicateCandidates(place: Place, places: Place[], query = '') {
  const key = nameKey(place.name)
  const q = query.trim().toLowerCase()
  return places
    .filter((p) => p.id !== place.id && p.group_id === place.group_id)
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .map((p) => {
      const k = nameKey(p.name)
      const likely =
        (!!key && !!k && (k === key || k.includes(key) || key.includes(k))) ||
        metres(place, p) <= 100 ||
        (!!place.restaurant_id && p.restaurant_id === place.restaurant_id)
      return { place: p, likely }
    })
    .sort((a, b) => Number(b.likely) - Number(a.likely) || a.place.name.localeCompare(b.place.name))
}
