// #87 Import from other apps: reads exported files on the phone (nothing is uploaded) and turns
// them into places to add. Understands:
//  • a maps app's data export: saved lists (CSV: Title, Note, URL…), starred places and your
//    reviews (GeoJSON with name, address, location, your star rating and review text)
//  • any spreadsheet saved as CSV with a name column (address, rating, notes, date… optional)
//  • a pasted list, one place per line ("Hana Ramen" or "Hana Ramen, Toronto")
// Matching each item to a real restaurant happens afterwards (see import-match).

export type ImportItem = {
  name: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  /** 0-5 (halves allowed) */
  rating?: number | null
  notes?: string | null
  /** YYYY-MM-DD */
  visited_on?: string | null
  status?: 'Been' | 'Want to try' | null
  /** the list it came from (a saved-list file name) */
  list?: string | null
}

// ---------- CSV ----------
/** RFC-4180-ish: quotes, doubled quotes, commas and newlines inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const pick = (header: string[], ...names: RegExp[]) =>
  header.findIndex((h) => names.some((re) => re.test(h.trim().toLowerCase())))

/** Any rating style → 0-5: "4", "4.5", "8/10", "85", "★★★★", "4 stars". */
export function toFive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  const stars = (text.match(/★/g) ?? []).length
  if (stars) return Math.min(5, stars)
  const outOf = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+)/.exec(text)
  let n = outOf ? (Number(outOf[1]) / Number(outOf[2])) * 5 : Number.parseFloat(text)
  if (!Number.isFinite(n) || n <= 0) return null
  if (!outOf) {
    if (n > 10)
      n = n / 20 // 0-100
    else if (n > 5) n = n / 2 // 0-10
  }
  return Math.max(0.5, Math.min(5, Math.round(n * 2) / 2))
}

/** "2024-03-09", "Mar 9, 2024", ISO timestamps → YYYY-MM-DD (or null). */
export function toDay(value: unknown): string | null {
  if (!value) return null
  const text = String(value).trim()
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  if (iso) return iso[1]
  const d = new Date(text)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1990 ? null : d.toISOString().slice(0, 10)
}

/** Coordinates hidden in a map link: "@43.65,-79.38,17z", "!3d43.65!4d-79.38", "?q=43.65,-79.38". */
export function coordsFromUrl(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null
  const tries = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  ]
  for (const re of tries) {
    const m = re.exec(decodeURIComponent(url))
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    }
  }
  return null
}

/** A place name hidden in a map link: ".../maps/place/Hana+Ramen/@..." → "Hana Ramen". */
export function nameFromUrl(url: string | null | undefined) {
  const m = url ? /\/maps\/place\/([^/@?]+)/.exec(url) : null
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')).trim() : null
}

/** Rows of any CSV with a name column. A saved-list export (Title, Note, URL) works too. */
export function itemsFromCsv(text: string, list: string | null = null): ImportItem[] {
  const rows = parseCsv(text)
  // Some exports put a blank or title line first: use the first row that looks like a header.
  const headerAt = rows.findIndex((r) =>
    r.some((c) => /^(title|name|place|restaurant|venue|spot)$/i.test(c.trim())),
  )
  if (headerAt < 0) return []
  const header = rows[headerAt]
  const col = {
    name: pick(header, /^(title|name|place|restaurant|venue|spot)$/),
    address: pick(header, /^(address|location|addr|full address)$/),
    city: pick(header, /^(city|town)$/),
    url: pick(header, /^(url|link|maps? url|google maps url)$/),
    lat: pick(header, /^(lat|latitude)$/),
    lng: pick(header, /^(lng|lon|long|longitude)$/),
    rating: pick(header, /^(rating|score|stars|my rating|your rating)$/),
    notes: pick(header, /^(note|notes|comment|comments|review|description)$/),
    date: pick(header, /^(date|visited|visited on|date visited|last visit)$/),
    status: pick(header, /^(status|been|visited\?|been there)$/),
  }
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  return rows
    .slice(headerAt + 1)
    .map((r): ImportItem | null => {
      const url = at(r, col.url)
      const name = at(r, col.name) || nameFromUrl(url) || ''
      if (!name || name.length > 160) return null
      const fromUrl = coordsFromUrl(url)
      const lat = Number.parseFloat(at(r, col.lat))
      const lng = Number.parseFloat(at(r, col.lng))
      const statusText = at(r, col.status).toLowerCase()
      const rating = toFive(at(r, col.rating))
      const visited = toDay(at(r, col.date))
      return {
        name,
        address: [at(r, col.address), at(r, col.city)].filter(Boolean).join(', ') || null,
        lat: Number.isFinite(lat) ? lat : (fromUrl?.lat ?? null),
        lng: Number.isFinite(lng) ? lng : (fromUrl?.lng ?? null),
        rating,
        notes: at(r, col.notes).slice(0, 1000) || null,
        visited_on: visited,
        status:
          /^(yes|y|true|been|visited|1)$/.test(statusText) || rating || visited
            ? 'Been'
            : /^(no|n|false|want|want to try|to try|0)$/.test(statusText)
              ? 'Want to try'
              : null,
        list,
      }
    })
    .filter((x): x is ImportItem => !!x)
}

/** Starred places / your reviews (GeoJSON from a maps app's data export, several layouts). */
export function itemsFromGeoJson(json: any, list: string | null = null): ImportItem[] {
  const features: any[] = Array.isArray(json?.features) ? json.features : []
  return features
    .map((f): ImportItem | null => {
      const p = f?.properties ?? {}
      const loc = p.location ?? p.Location ?? {}
      const url = p.google_maps_url ?? p['Google Maps URL'] ?? p.url ?? null
      const name = String(loc.name ?? p.Title ?? p.title ?? p.name ?? nameFromUrl(url) ?? '').trim()
      if (!name || name.length > 160) return null
      const [lng, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : []
      const coords =
        typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0)
          ? { lat, lng }
          : coordsFromUrl(url)
      const rating = toFive(
        p.five_star_rating_published ?? p['Star Rating'] ?? p.star_rating ?? p.rating,
      )
      const review = p.review_text_published ?? p['Review Comment'] ?? p.review ?? null
      return {
        name,
        address: loc.address ?? p.address ?? p.Address ?? null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        rating,
        notes: review ? String(review).slice(0, 1000) : null,
        visited_on: toDay(p.date ?? p.Published ?? p.published ?? p['Updated'] ?? null),
        status: rating || review ? 'Been' : null,
        list,
      }
    })
    .filter((x): x is ImportItem => !!x)
}

/** A pasted list: one place a line; "Name, City" or "Name - 4/5" both work. */
export function itemsFromText(text: string): ImportItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 2 && line.length <= 200)
    .map((line) => {
      const rated = /\s[-–—:]\s*(\d+(?:\.\d+)?\s*(?:\/\s*\d+)?|★+)\s*$/.exec(line)
      const rest = rated ? line.slice(0, rated.index).trim() : line
      const [name, ...where] = rest.split(',')
      const rating = rated ? toFive(rated[1]) : null
      return {
        name: name.trim(),
        address: where.join(',').trim() || null,
        rating,
        status: rating ? ('Been' as const) : null,
      }
    })
    .filter((item) => item.name.length >= 2)
}

/** Same restaurant listed twice (e.g. starred AND reviewed): keep one, merging what each knows. */
export function mergeDuplicates(items: ImportItem[]): ImportItem[] {
  const out: ImportItem[] = []
  for (const item of items) {
    const key = item.name.trim().toLowerCase()
    const twin = out.find(
      (o) =>
        o.name.trim().toLowerCase() === key &&
        (o.lat == null ||
          item.lat == null ||
          (Math.abs(o.lat - item.lat) < 0.002 && Math.abs((o.lng ?? 0) - (item.lng ?? 0)) < 0.003)),
    )
    if (!twin) out.push({ ...item })
    else
      for (const k of Object.keys(item) as (keyof ImportItem)[])
        if (twin[k] == null && item[k] != null) (twin as any)[k] = item[k]
  }
  return out
}

/** Reads one file (CSV, JSON/GeoJSON or plain text) by its name and text. */
export function itemsFromFile(name: string, text: string): ImportItem[] {
  const base = name.split('/').pop() ?? name
  const list = base.replace(/\.(csv|json|geojson|txt)$/i, '').trim() || null
  if (/\.(json|geojson)$/i.test(base)) {
    try {
      return itemsFromGeoJson(
        JSON.parse(text),
        /saved places|reviews/i.test(list ?? '') ? null : list,
      )
    } catch {
      return []
    }
  }
  if (/\.csv$/i.test(base)) return itemsFromCsv(text, list)
  return itemsFromText(text)
}

/** Files in an export worth reading (skips everything that isn't places). */
export const importable = (path: string) =>
  /\.(csv|json|geojson|txt)$/i.test(path) &&
  !/(__MACOSX|\/\.|archive_browser|labels|commute|timeline|location history)/i.test(path)
