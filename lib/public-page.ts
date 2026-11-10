// Public restaurant pages (/r/<city>/<name>) and public profiles (/u/<handle>): the data the
// database hands out (totals only, 3+ groups, nothing borrowed from Google) and the small
// helpers that turn it into text. Pure functions, no network.
import { knownFacts, type AttrKey, type AttrSummary } from './good-to-know.ts'
import { hoursToText } from './hours-text.ts'
import { busyText, waitText, type MealTime } from './visit-rating.ts'
import type { Hours } from './place-info.ts'

export type PublicRestaurant = {
  id: string
  name: string
  city: string | null
  slug: string | null
  claimed: boolean
  google_place_id: string | null
  cuisine: string | null
  price_level: number | null
  address: string | null
  phone: string | null
  website: string | null
  /** where facts read off the restaurant's own website came from, and when (website facts only) */
  /** a booking link, only present when an admin has agreed it with the restaurant */
  reservation_url?: string | null
  /** Part three: 2+ groups said lately it looked closed (banner only) */
  maybe_closed?: { groups: number; last: string | null } | null
  /** Part three: this week's dish, picked automatically across all public pages */
  dish_of_week?: DishOfWeek | null
  source_urls?: Record<string, string> | null
  source_at?: Record<string, string> | null
  hours: Hours | null
  business_status: string | null
  lat: number | null
  lng: number | null
  saved_by_groups: number | null
  rating: {
    avg: number
    groups: number
    ratings: number
    hist: Record<'1' | '2' | '3' | '4' | '5', number>
    would_return: number | null
  } | null
  visits: number | null
  known_for: { reason: string; n: number }[]
  top_dishes: { name: string; points: number; groups: number }[]
  menu: {
    name: string
    price: number | null
    course: string | null
    dietary: string[] | null
    description: string | null
    claimed: boolean
  }[]
  spend: { per_head: number; lunch: number | null; dinner: number | null } | null
  wait: number | null
  busy: { dow: number; meal: MealTime; n: number }[] | null
  good_to_know: Record<string, { verdict: boolean; owner: boolean | null }>
  tips: { kind: 'entrance' | 'parking' | 'storefront'; body: string | null; photo_path: string | null }[]
  posts: { kind: string; title: string; body: string | null; ends_on: string | null }[]
}

export type PublicProfile = {
  handle: string
  name: string
  avatar_url: string | null
  bio: string | null
  show: Record<string, boolean> | null
  stats: { places?: number; cuisines?: number; cities?: number; visits?: number } | null
  badges: { key: string; label: string; emoji?: string }[]
  passport: { city: string; count: number }[]
  places: {
    name: string
    city: string
    slug: string
    cuisine: string | null
    score: number | null
    lat: number | null
    lng: number | null
  }[]
  dishes: { dish: string; restaurant: string; city: string; slug: string }[]
}

export type PublicRedirect = { redirect: { city: string; slug: string } }
export const isRedirect = (x: unknown): x is PublicRedirect =>
  !!x && typeof x === 'object' && 'redirect' in x

// ---------- links ----------
export const restaurantPath = (city: string, slug: string) =>
  `/r/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`
export const profilePath = (handle: string) => `/u/${encodeURIComponent(handle.toLowerCase())}`

/** "etobicoke" → "Etobicoke", "st-catharines" → "St Catharines". */
export const cityLabel = (slug: string | null | undefined) =>
  (slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')

// ---------- small bits of text ----------
export const priceText = (level: number | null | undefined) =>
  level && level >= 1 && level <= 4 ? '$'.repeat(level) : null

/** "Vietnamese · $$ · Etobicoke" (whatever is known). */
export function metaLine(r: Pick<PublicRestaurant, 'cuisine' | 'price_level' | 'city'>) {
  return [r.cuisine, priceText(r.price_level), cityLabel(r.city)].filter(Boolean).join(' · ')
}

/** "4.4 from 12 groups" */
export function scoreLine(r: Pick<PublicRestaurant, 'rating'>) {
  if (!r.rating) return null
  const n = r.rating.groups
  return `${Number(r.rating.avg).toFixed(1)} from ${n} group${n === 1 ? '' : 's'}`
}

/** Rows for the 5★…1★ bars, widest bar = 100%. */
export function histRows(hist: NonNullable<PublicRestaurant['rating']>['hist']) {
  const rows = ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    count: Number(hist[String(stars) as '1']) || 0,
  }))
  const most = Math.max(1, ...rows.map((r) => r.count))
  return rows.map((r) => ({ ...r, pct: Math.round((100 * r.count) / most) }))
}

/** Facts people agree on (warnings first), written for strangers. */
export function factChips(good: PublicRestaurant['good_to_know']) {
  const attrs: AttrSummary['attrs'] = {}
  for (const [key, v] of Object.entries(good ?? {}))
    attrs[key as AttrKey] = {
      yes: 0,
      no: 0,
      mine: null,
      owner: v.owner ?? null,
      verdict: v.verdict,
    }
  return knownFacts({ attrs })
}

export const busyLine = (r: Pick<PublicRestaurant, 'busy'>) => busyText(r.busy)
export const waitLine = (r: Pick<PublicRestaurant, 'wait'>) => waitText(r.wait)

/** "About $22 a head · lunch $14 · dinner $28" */
export function spendLine(spend: PublicRestaurant['spend']) {
  if (!spend?.per_head) return null
  const parts = [`About $${spend.per_head} a head`]
  if (spend.lunch) parts.push(`lunch $${spend.lunch}`)
  if (spend.dinner) parts.push(`dinner $${spend.dinner}`)
  return parts.join(' · ')
}

/** One line per run of days: "Mon-Fri 11am-10pm". */
export const hoursLines = (hours: Hours | null | undefined) =>
  hours ? hoursToText(hours).split(';').map((s) => s.trim()).filter(Boolean) : []

export const phoneHref = (phone: string | null | undefined) => {
  const digits = (phone ?? '').replace(/[^\d+]/g, '')
  return digits.length >= 7 ? `tel:${digits}` : null
}

/** Only web links go on the page, never javascript: or similar. */
export function safeUrl(url: string | null | undefined) {
  if (!url) return null
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export const siteLabel = (url: string | null | undefined) => {
  const u = safeUrl(url)
  return u ? new URL(u).hostname.replace(/^www\./, '') : null
}

const SITE_FACT_LABEL: Record<string, string> = {
  hours: 'Hours',
  phone: 'Phone',
  address: 'Address',
  website: 'Website',
  cuisine: 'Cuisine',
  price_level: 'Price',
  location: 'Map pin',
}

/**
 * The facts that came from the restaurant's own website, one entry per page: which facts, the
 * page's address and the day it was last read. Only facts the page actually shows, and only
 * web links. Used for the "From lanternpho.com · checked Nov 4" line on the Info tab.
 */
export function websiteSources(
  r: Pick<PublicRestaurant, 'source_urls' | 'source_at' | 'phone' | 'website' | 'address' | 'hours' | 'cuisine' | 'price_level'>,
) {
  const shown: Record<string, unknown> = {
    hours: r.hours,
    phone: r.phone,
    address: r.address,
    website: r.website,
    cuisine: r.cuisine,
    price_level: r.price_level,
    location: null,
  }
  const pages = new Map<string, { url: string; host: string; facts: string[]; checked: string | null }>()
  for (const [fact, raw] of Object.entries(r.source_urls ?? {})) {
    const label = SITE_FACT_LABEL[fact]
    const url = safeUrl(raw)
    if (!label || !url || !shown[fact]) continue
    const page = pages.get(url) ?? { url, host: siteLabel(url) ?? url, facts: [], checked: null }
    page.facts.push(label)
    const at = r.source_at?.[fact]
    if (at && !Number.isNaN(Date.parse(at)) && (!page.checked || at > page.checked)) page.checked = at
    pages.set(url, page)
  }
  return [...pages.values()]
}

/** Directions open in Maps by name (+ Google's place id when we have it) — nothing is copied from Google. */
export function directionsUrl(r: Pick<PublicRestaurant, 'name' | 'address' | 'google_place_id'>) {
  const query = encodeURIComponent([r.name, r.address].filter(Boolean).join(' '))
  return r.google_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(r.google_place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`
}

export const isClosedForGood = (r: Pick<PublicRestaurant, 'business_status'>) =>
  r.business_status === 'CLOSED_PERMANENTLY'

/** Menu grouped by course, in the usual order. */
export function menuSections(menu: PublicRestaurant['menu']) {
  const order = ['starter', 'main', 'side', 'dessert', 'drink']
  const by = new Map<string, PublicRestaurant['menu']>()
  for (const m of menu ?? []) {
    const key = m.course && order.includes(m.course) ? m.course : 'other'
    by.set(key, [...(by.get(key) ?? []), m])
  }
  return [...order, 'other']
    .filter((k) => by.has(k))
    .map((k) => ({ course: k, items: by.get(k)! }))
}

/** Page description for link previews, from public facts only. */
export function pageDescription(r: PublicRestaurant) {
  return [metaLine(r), scoreLine(r) && `Rated ${scoreLine(r)} on Crumbs`].filter(Boolean).join(' — ')
}

/** Part three: Dish of the week — totals only (average score out of 100, how many groups). */
export type DishOfWeek = { name: string; points: number; groups: number; restaurant_id: string; restaurant: string; city: string; slug: string }

export function readDishOfWeek(data: unknown): DishOfWeek | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  const name = str(d.name), restaurant = str(d.restaurant), city = str(d.city), slug = str(d.slug), id = str(d.restaurant_id)
  const points = Number(d.points), groups = Number(d.groups)
  if (!name || !restaurant || !city || !slug || !id || !Number.isFinite(points) || !(groups >= 3)) return null
  return { name, points: Math.max(0, Math.min(100, Math.round(points))), groups: Math.floor(groups), restaurant_id: id, restaurant, city, slug }
}
