// Finds the OpenStreetMap entry for a restaurant (same place, similar name, within ~80 m) and
// turns its tags into facts Crumbs can keep forever (OSM data is open, with credit).
import { parseHoursText } from './hours-text.ts'
import type { Hours } from './place-info'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(the|restaurant|cafe|café|bar|grill|kitchen|and|&)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** 0..1 — how alike two names are (shared words, or one inside the other). */
export function nameMatch(a: string, b: string) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.85
  const wa = new Set(x.split(' '))
  const wb = new Set(y.split(' '))
  const shared = [...wa].filter((w) => wb.has(w)).length
  return shared / Math.max(wa.size, wb.size)
}

export function matchQuery(lat: number, lon: number, radius = 80) {
  return `[out:json][timeout:10];nwr["name"]["amenity"~"^(restaurant|fast_food|cafe|bar|pub|food_court|ice_cream|biergarten)$"](around:${radius},${lat.toFixed(6)},${lon.toFixed(6)});out center tags 30;`
}

export type OpenFacts = {
  osm: string
  data: { address?: string; phone?: string; website?: string; cuisine?: string; hours?: Hours }
}

/** Best OSM element for this restaurant name, as facts. Null when nothing matches well enough. */
export function bestMatch(json: any, name: string, utc: number): OpenFacts | null {
  const scored = ((json?.elements ?? []) as any[])
    .filter((el) => el.tags?.name)
    .map((el) => ({ el, score: nameMatch(el.tags.name, name) }))
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score)
  const el = scored[0]?.el
  if (!el) return null
  const t = el.tags
  const data: OpenFacts['data'] = {}
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
  const address = [street, t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ')
  if (street) data.address = address
  const phone = t.phone ?? t['contact:phone']
  if (phone) data.phone = String(phone).split(';')[0].trim().slice(0, 40)
  const website = t.website ?? t['contact:website']
  if (typeof website === 'string' && /^https?:\/\//i.test(website))
    data.website = website.slice(0, 300)
  if (t.cuisine)
    data.cuisine = String(t.cuisine)
      .split(';')[0]
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m: string) => m.toUpperCase())
  if (t.opening_hours) {
    const hours = parseHoursText(String(t.opening_hours), utc)
    if (hours) data.hours = hours
  }
  const type = el.type === 'way' ? 'W' : el.type === 'relation' ? 'R' : 'N'
  return { osm: `${type}${el.id}`, data }
}
