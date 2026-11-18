// "Add a place" shows places already on Crumbs first, then Google/OpenStreetMap matches.
// The same restaurant often comes back under a slightly different name
// ("Nomé Izakaya North York" vs "Nome Izakaya") and a different address style
// ("Yonge Street, North York" vs "4848 Yonge St, Toronto"). These helpers spot that.

export type SearchSpot = {
  name: string
  address: string | null
  lat?: number | null
  lng?: number | null
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const STREET_WORDS: Record<string, string> = {
  st: 'street',
  rd: 'road',
  ave: 'avenue',
  av: 'avenue',
  blvd: 'boulevard',
  dr: 'drive',
  cres: 'crescent',
  crt: 'court',
  ct: 'court',
  pl: 'place',
  ln: 'lane',
  hwy: 'highway',
  pkwy: 'parkway',
  sq: 'square',
  e: 'east',
  w: 'west',
  n: 'north',
  s: 'south',
}

/** "4848 Yonge St, Toronto" and "Yonge Street, North York" both give "yonge street". */
export function streetOf(address: string | null | undefined): string {
  const first = (address ?? '').split(',')[0] ?? ''
  const words = fold(first)
    .split(' ')
    .filter(Boolean)
    // house numbers and unit numbers ("4848", "#2", "2a") aren't the street
    .filter((w) => !/^\d+[a-z]?$/.test(w) && w !== 'unit' && w !== 'suite')
    .map((w) => STREET_WORDS[w] ?? w)
  // Needs a word that says it's a street, or it's probably just a city ("Toronto").
  const isStreet = words.some((w) => Object.values(STREET_WORDS).includes(w) || /^(way|terrace|circle|gate|row|trail|line|esplanade|promenade|walk|mews|plaza|queensway|kingsway)$/.test(w))
  return isStreet ? words.join(' ') : ''
}

const FILLER = new Set(['the', 'restaurant', 'restaurants', 'and', 'ltd', 'inc', 'co'])

/** Name words with area words (anything in either address after the street) and filler taken out. */
function nameWords(name: string, area: Set<string>) {
  const plain = fold(name.replace(/\([^)]*\)/g, ' ').replace(/\s[-–—|]\s.*$/, ' '))
  return plain.split(' ').filter((w) => w && !FILLER.has(w) && !area.has(w))
}

function areaWords(address: string | null | undefined) {
  const parts = (address ?? '').split(',').slice(1).join(' ')
  return fold(parts).split(' ').filter((w) => w.length > 1)
}

const metersBetween = (a: SearchSpot, b: SearchSpot) => {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat! - a.lat!)
  const dLng = toRad(b.lng! - a.lng!)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat!)) * Math.cos(toRad(b.lat!)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Same restaurant? The names match once accents, "(Don Mills)", area words and filler are
 * ignored, AND they're on the same street (or within 250 m when both have a pin).
 * Careful on purpose: two different "Pizza ..." places on one street stay separate.
 */
export function sameSearchSpot(a: SearchSpot, b: SearchSpot): boolean {
  const area = new Set([...areaWords(a.address), ...areaWords(b.address)])
  const x = nameWords(a.name, area)
  const y = nameWords(b.name, area)
  if (!x.length || !y.length || x.join(' ') !== y.join(' ')) return false
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) return metersBetween(a, b) <= 250
  const sa = streetOf(a.address)
  const sb = streetOf(b.address)
  return !!sa && sa === sb
}

/** Drops the outside results that are already shown as "On Crumbs". */
export function withoutCrumbsTwins<T>(outside: T[], onCrumbs: SearchSpot[], spot: (item: T) => SearchSpot): T[] {
  return outside.filter((item) => !onCrumbs.some((c) => sameSearchSpot(c, spot(item))))
}
