// Reads the facts a restaurant publishes about itself on its own website (the schema.org
// "structured data" most site builders add for Google), so Crumbs can fill gaps — hours,
// phone, cuisine, price, menu link — without paying for a Google lookup.
// Pure functions only (no fetching) so they can be tested.
import type { Hours } from './place-info'

export type SiteInfo = {
  phone: string | null
  cuisine: string | null
  /** 1–4, from a "$$"-style price range */
  price_level: number | null
  /** periods only; the caller adds the UTC offset */
  periods: Hours['periods'] | null
  menu_url: string | null
  reservations: string | null
  image: string | null
  description: string | null
}

const FOOD_TYPES =
  /^(Restaurant|FoodEstablishment|FastFoodRestaurant|CafeOrCoffeeShop|BarOrPub|Bakery|IceCreamShop|Brewery|Winery|Distillery|LocalBusiness)$/i
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_SHORT = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa']

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value]
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? decode(value.trim()) : null

function decode(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Every JSON-LD node on the page, with @graph and arrays flattened. */
export function jsonLdNodes(html: string): any[] {
  const out: any[] = []
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    out.push(node)
    if (node['@graph']) walk(node['@graph'])
  }
  while ((match = pattern.exec(html))) {
    try {
      walk(JSON.parse(match[1].trim()))
    } catch {}
  }
  return out
}

function isFoodNode(node: any) {
  return asArray(node?.['@type']).some((t) => typeof t === 'string' && FOOD_TYPES.test(t))
}

function minutes(value: unknown): [number, number] | null {
  const m = typeof value === 'string' ? value.match(/^(\d{1,2})(?::(\d{2}))?/) : null
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  return h <= 24 && min < 60 ? [h, min] : null
}

function dayIndex(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const name = raw.split('/').pop()!.toLowerCase()
  const full = DAY_NAMES.indexOf(name)
  if (full >= 0) return full
  const short = DAY_SHORT.indexOf(name.slice(0, 2))
  return short >= 0 ? short : null
}

/** One open → close span on a day, closing on the next day when it runs past midnight. */
function period(day: number, open: [number, number], close: [number, number]) {
  const o: [number, number, number] = [day, open[0] % 24, open[1]]
  const openMin = open[0] * 60 + open[1]
  const closeMin = close[0] * 60 + close[1]
  // Open all day (00:00–23:59 or 00:00–24:00)
  if (openMin === 0 && closeMin >= 1439) return { o, c: [(day + 1) % 7, 0, 0] as [number, number, number] }
  const nextDay = closeMin <= openMin || close[0] === 24
  return {
    o,
    c: [(day + (nextDay ? 1 : 0)) % 7, close[0] % 24, close[1]] as [number, number, number],
  }
}

/** schema.org openingHoursSpecification → periods */
export function periodsFromSpec(spec: any): Hours['periods'] {
  const out: Hours['periods'] = []
  for (const item of asArray(spec)) {
    const open = minutes(item?.opens)
    const close = minutes(item?.closes)
    if (!open || !close) continue
    if (open[0] === 0 && open[1] === 0 && close[0] === 0 && close[1] === 0) continue // "closed"
    for (const d of asArray(item?.dayOfWeek)) {
      const day = dayIndex(d)
      if (day !== null) out.push(period(day, open, close))
    }
  }
  return out
}

/** schema.org openingHours strings like "Mo-Fr 11:00-22:00", "Sa,Su 10-23" → periods */
export function periodsFromText(value: unknown): Hours['periods'] {
  const out: Hours['periods'] = []
  for (const line of asArray(value).flatMap((v) => (typeof v === 'string' ? v.split(/[;\n]/) : []))) {
    const m = line.trim().match(/^([A-Za-z,\-\s]+?)\s+(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)$/)
    if (!m) continue
    const open = minutes(m[2])
    const close = minutes(m[3])
    if (!open || !close) continue
    const days = new Set<number>()
    for (const part of m[1].split(',')) {
      const [a, b] = part.trim().split('-').map((s) => dayIndex(s.trim()))
      if (a === null || a === undefined) continue
      if (b === null || b === undefined) days.add(a)
      else for (let d = a, n = 0; n < 7; d = (d + 1) % 7, n++) {
        days.add(d)
        if (d === b) break
      }
    }
    days.forEach((day) => out.push(period(day, open, close)))
  }
  return out
}

function priceLevel(range: unknown) {
  const value = typeof range === 'string' ? range.trim() : ''
  return /^\${1,4}$/.test(value) ? value.length : null
}

function cleanPhone(value: string | null) {
  if (!value) return null
  const phone = value.replace(/^tel:/i, '').trim()
  return /\d{6,}/.test(phone.replace(/\D/g, '')) ? phone.slice(0, 30) : null
}

function meta(html: string, key: string) {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'))
  return m ? decode(m[1].trim()) : null
}

function absolute(url: string | null, base: string) {
  if (!url) return null
  try {
    const out = new URL(url, base)
    return out.protocol === 'https:' || out.protocol === 'http:' ? out.toString() : null
  } catch {
    return null
  }
}

/** Everything useful the page says about itself. */
export function readSiteInfo(html: string, base: string): SiteInfo {
  const nodes = jsonLdNodes(html)
  const node = nodes.find(isFoodNode) ?? null
  const cuisine = asArray(node?.servesCuisine)
    .map(text)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
  let periods = node ? periodsFromSpec(node.openingHoursSpecification) : []
  if (!periods.length && node) periods = periodsFromText(node.openingHours)
  const menuRaw = node?.hasMenu ?? node?.menu
  const menu = text(typeof menuRaw === 'object' ? menuRaw?.url ?? menuRaw?.['@id'] : menuRaw)
  const reserve = node?.acceptsReservations
  const image = asArray(node?.image)
    .map((i: any) => text(typeof i === 'object' ? i?.url : i))
    .find(Boolean)
  const telLink = html.match(/href=["']tel:([^"']+)["']/i)?.[1] ?? null
  return {
    phone: cleanPhone(text(node?.telephone) ?? (telLink ? decodeURIComponent(telLink) : null)),
    cuisine: cuisine || null,
    price_level: priceLevel(node?.priceRange),
    periods: periods.length ? periods : null,
    menu_url: absolute(menu, base),
    reservations:
      typeof reserve === 'string' && /^https?:/i.test(reserve) ? absolute(reserve, base) : null,
    image: absolute(image ?? meta(html, 'og:image'), base),
    description: (text(node?.description) ?? meta(html, 'og:description') ?? meta(html, 'description'))
      ?.slice(0, 280) ?? null,
  }
}
