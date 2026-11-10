// Shared restaurant profiles: one copy per real restaurant, reused by every group (#27), with a
// community menu fed by menu photos and website imports (#19). Only facts about the restaurant
// live here — ratings, notes and who goes where stay inside each group.
import type { Hours } from './place-info'
import type { PointRules } from './tiers'

export type Restaurant = {
  id: string
  source_key: string
  name: string
  formatted_address: string | null
  latitude: number | null
  longitude: number | null
  cuisine: string | null
  price_level: number | null
  website: string | null
  google_maps_url: string | null
  opening_hours: Hours | null
  business_status: string | null
  hours_checked_at: string | null
  details_checked_at: string | null
  places_count: number
  // Data ownership (#27): where each field came from, and how many members confirmed it.
  sources?: Partial<Record<FactField, FactSource>>
  /** when each fact was last checked/changed (ISO) */
  source_at?: Partial<Record<FactField, string>>
  /** the page a website-sourced fact was read from (Round 55) */
  source_urls?: Partial<Record<FactField, string>>
  /** when the restaurant's own website was last read */
  site_checked_at?: string | null
  verified?: Partial<
    Record<FactField, { n: number; at: string; groups?: number; claimed?: boolean }>
  >
  phone?: string | null
  osm_id?: string | null
  osm_checked_at?: string | null
  /** An approved owner manages this page ("Verified by Owner"). */
  owner_verified?: boolean
}

export type FactField =
  | 'name'
  | 'address'
  | 'location'
  | 'hours'
  | 'phone'
  | 'website'
  | 'price_level'
  | 'cuisine'
  | 'status'
/** owner > crumbs (members) > site (the restaurant's own website) > osm > google (temporary) */
export type FactSource = 'owner' | 'crumbs' | 'site' | 'osm' | 'google'

/** Facts Crumbs may keep for good (everything except Google's). */
export const OWNED_SOURCES: FactSource[] = ['owner', 'crumbs', 'site', 'osm']
export const isOwned = (r: Restaurant | null | undefined, f: FactField) =>
  OWNED_SOURCES.includes(r?.sources?.[f] as FactSource)

const SOURCE_LABEL: Record<FactSource, string> = {
  owner: 'From the restaurant',
  crumbs: 'From members',
  site: 'From their website',
  osm: 'From OpenStreetMap',
  google: 'From Google',
}

/** "From their website · Oct 2026" — where a fact came from and when it was last checked. */
export function factOrigin(r: Restaurant | null | undefined, f: FactField): string | null {
  const src = r?.sources?.[f]
  if (!src || !SOURCE_LABEL[src]) return null
  const at = r?.verified?.[f]?.at ?? r?.source_at?.[f]
  const when = at
    ? new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null
  return when ? `${SOURCE_LABEL[src]} · ${when}` : SOURCE_LABEL[src]
}
/**
 * Does what a member just entered differ from what the page currently shows? Only for facts where
 * we can tell: hours (compared by their opening periods), phone (digits only), website, cuisine and
 * price. Returns false when the page shows nothing yet — filling a gap isn't a disagreement.
 */
export function differsFromPage(r: Restaurant | null | undefined, f: FactField, val: unknown): boolean {
  if (!r) return false
  const digits = (x: unknown) => String(x ?? '').replace(/\D/g, '')
  const text = (x: unknown) => String(x ?? '').trim().toLowerCase().replace(/\/+$/, '')
  switch (f) {
    case 'hours': {
      const cur = r.opening_hours?.periods
      const next = (val as Hours | null)?.periods
      if (!cur?.length || !next?.length) return false
      return JSON.stringify(cur) !== JSON.stringify(next)
    }
    case 'phone':
      return !!r.phone && digits(r.phone) !== digits(val)
    case 'website':
      return !!r.website && text(r.website) !== text(val)
    case 'cuisine':
      return !!r.cuisine && text(r.cuisine) !== text(val)
    case 'price_level':
      return r.price_level != null && Number(r.price_level) !== Number(val)
    default:
      return false
  }
}

/**
 * How fresh a fact is, for the little dot beside it: green up to 60 days, amber up to 180, grey
 * after that (or when nobody knows when it was last checked). `label` is "checked 3 weeks ago".
 */
export function factFreshness(
  r: Restaurant | null | undefined,
  f: FactField,
  now = new Date(),
): { level: 'fresh' | 'aging' | 'old'; label: string } | null {
  if (!r?.sources?.[f]) return null
  const at = r.verified?.[f]?.at ?? r.source_at?.[f] ?? (f === 'hours' ? r.hours_checked_at : null)
  if (!at || Number.isNaN(new Date(at).getTime())) return { level: 'old', label: 'not checked in a while' }
  const days = Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 864e5))
  const label =
    days < 2 ? 'checked today' : days < 14 ? `checked ${days} days ago` : days < 60 ? `checked ${Math.round(days / 7)} weeks ago` : `checked ${Math.round(days / 30)} months ago`
  return { level: days <= 60 ? 'fresh' : days <= 180 ? 'aging' : 'old', label }
}
const SOURCE_WHY: Record<FactSource, string> = {
  owner: 'The restaurant entered this itself.',
  crumbs: 'Members who were there entered or confirmed this.',
  site: 'Read from the restaurant’s own website.',
  osm: 'Taken from OpenStreetMap, the free community map.',
  google: 'Google’s value. Crumbs can’t keep it, so it may go away. Add what you see.',
}

/**
 * The plain-words answer to "why am I seeing this?" for one fact: where it came from, when it
 * was last checked, how many members confirmed it, and the page it was read from (if any).
 */
export function factWhy(r: Restaurant | null | undefined, f: FactField, now = new Date()): string[] {
  const src = r?.sources?.[f]
  if (!src || !SOURCE_WHY[src]) return []
  const lines = [SOURCE_WHY[src]]
  const fresh = factFreshness(r, f, now)
  if (fresh) lines.push(fresh.level === 'fresh' ? `Fresh: ${fresh.label}.` : `Getting old: ${fresh.label}.`)
  const n = r?.verified?.[f]?.n ?? 0
  if (n > 1) lines.push(`${n} members have confirmed it.`)
  else if (n === 1) lines.push('One member has confirmed it.')
  const page = r?.source_urls?.[f]
  if (page && /^https?:\/\//i.test(page)) lines.push(`Page: ${page.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 80)}`)
  return lines
}
export type Evidence = 'in_person' | 'photo' | 'website' | 'receipt' | 'phone_call'

/**
 * The facts members can add or fix (name/location come with the place; price comes from the
 * menu's prices, see refresh_menu_price).
 */
export const PROFILE_FIELDS: FactField[] = [
  'address',
  'hours',
  'phone',
  'website',
  'cuisine',
  'status',
]

/** Details only the restaurant can change once its page is Verified by Owner (same as owner_locked()). */
export const OWNER_LOCKED: FactField[] = [
  'name',
  'address',
  'location',
  'hours',
  'phone',
  'website',
  'cuisine',
  'price_level',
]
export const ownerLocked = (r: Restaurant | null, f: FactField) =>
  !!r?.owner_verified && OWNER_LOCKED.includes(f)

const has = (r: Restaurant, f: FactField) => {
  switch (f) {
    case 'address':
      return !!r.formatted_address
    case 'hours':
      return !!r.opening_hours
    case 'phone':
      return !!r.phone
    case 'website':
      return !!r.website
    case 'price_level':
      return r.price_level !== null && r.price_level !== undefined
    case 'cuisine':
      return !!r.cuisine
    case 'status':
      return !!r.business_status
    default:
      return true
  }
}

/**
 * How much of a profile Crumbs owns: fields that came from members or open data count fully,
 * Google-only or missing fields don't. 0-100.
 */
export function ownedShare(r: Restaurant) {
  const owned = PROFILE_FIELDS.filter(
    (f) =>
      has(r, f) &&
      (r.sources?.[f] === 'owner' || r.sources?.[f] === 'crumbs' || r.sources?.[f] === 'osm'),
  )
  return Math.round((owned.length / PROFILE_FIELDS.length) * 100)
}

/** Fields that still need a member's eyes: missing, or only known from Google. */
export const needsHelp = (r: Restaurant) =>
  PROFILE_FIELDS.filter((f) => !has(r, f) || !r.sources?.[f] || r.sources?.[f] === 'google')

export type MenuDish = {
  id: string
  restaurant_id: string
  name: string
  name_key: string
  price: number | null
  description: string | null
  course: 'starter' | 'main' | 'side' | 'dessert' | 'drink' | null
  dietary: string[]
  source: 'photo' | 'website' | 'manual' | 'receipt'
  /** Added or checked by the restaurant's verified owner. */
  owner_ok?: boolean
  /** flagged off the menu by members (only the owner and admins still see these) */
  hidden?: boolean
  confirms: number
  flags: number
  price_checked_at: string
}

export type NewMenuDish = {
  name: string
  price?: number | null
  description?: string | null
  course?: MenuDish['course']
}

/** Same rule as the database's dish_key(): lower case, punctuation → spaces. */
export const dishKey = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9à-ÿ]+/g, ' ')
    .trim()

export const shareable = (googlePlaceId: string) => !googlePlaceId.startsWith('manual:')

/** How old a menu price is, in words ("3 months ago"). */
export function priceAge(iso: string, now = new Date()) {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 864e5)
  if (days < 1) return 'today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

/** Prices older than ~6 months get a "price from …" note. */
export const priceIsOld = (iso: string, now = Date.now()) =>
  now - new Date(iso).getTime() > 180 * 864e5

/** Menu dishes not already in the group's own dish list. */
export function missingFromOurs(menu: MenuDish[], ours: { name: string }[]) {
  const have = new Set(ours.map((d) => dishKey(d.name)))
  return menu.filter((d) => !have.has(d.name_key))
}

const COURSE_ORDER = ['starter', 'main', 'side', 'dessert', 'drink', null]
/** Course order, then the most-confirmed first. */
export const sortMenu = (menu: MenuDish[]) =>
  [...menu].sort(
    (a, b) =>
      COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course) ||
      b.confirms - a.confirms ||
      a.name.localeCompare(b.name),
  )

// ---------- database calls ----------
export async function linkRestaurant(supabase: any, placeId: string): Promise<Restaurant | null> {
  const { data, error } = await supabase.rpc('link_restaurant', { target_place: placeId })
  if (error) throw error
  return data?.id ? data : null
}

export async function loadRestaurant(supabase: any, id: string): Promise<Restaurant | null> {
  const { data } = await supabase.from('restaurants').select('*').eq('id', id).maybeSingle()
  return data ?? null
}

export async function loadMenu(supabase: any, restaurantId: string, userId?: string) {
  const [menu, votes] = await Promise.all([
    supabase.from('restaurant_dishes').select('*').eq('restaurant_id', restaurantId).limit(300),
    userId
      ? supabase.from('restaurant_dish_votes').select('dish_id,vote').eq('user_id', userId)
      : Promise.resolve({ data: [] }),
  ])
  if (menu.error) throw menu.error
  const mine = Object.fromEntries(
    (votes.data ?? []).map((v: any) => [v.dish_id, v.vote]),
  ) as Record<string, 'confirm' | 'flag'>
  return { menu: sortMenu(menu.data ?? []) as MenuDish[], mine }
}

export async function shareDishes(
  supabase: any,
  restaurantId: string,
  dishes: NewMenuDish[],
  how: 'photo' | 'website' | 'manual' | 'receipt',
) {
  const clean = dishes
    .filter((d) => d.name?.trim())
    .slice(0, 80)
    .map((d) => ({
      name: d.name.trim().slice(0, 120),
      price: d.price ?? null,
      description: d.description ?? null,
      course: d.course ?? null,
    }))
  if (!clean.length) return 0
  const { data, error } = await supabase.rpc('add_restaurant_dishes', {
    target: restaurantId,
    dishes: clean,
    how,
  })
  if (error) throw error
  return data as number
}

export async function voteDish(supabase: any, dishId: string, choice: 'confirm' | 'flag' | null) {
  const { error } = await supabase.rpc('vote_restaurant_dish', { target_dish: dishId, choice })
  if (error) throw error
}

export async function shareHours(
  supabase: any,
  restaurantId: string,
  hours: unknown,
  status: string | null,
) {
  await supabase.rpc('share_restaurant_hours', {
    target: restaurantId,
    hours,
    status: status ?? '',
  })
}

export type FactResult = {
  applied: boolean
  agree: number
  claimed?: boolean
  /** points this earned (only new info earns any) */
  points?: number
  /** Verified-by-Owner page: sent to the owner as a suggestion instead */
  locked?: boolean
}

export async function contributeFact(
  supabase: any,
  restaurantId: string,
  fact: FactField,
  val: unknown,
  how: Evidence = 'in_person',
): Promise<FactResult> {
  const { data, error } = await supabase.rpc('contribute_fact', {
    target: restaurantId,
    fact,
    val,
    how,
  })
  if (error) throw error
  return data
}

/** Asks the server to fill the profile from OpenStreetMap (at most every ~3 months per restaurant). */
export async function matchOpenData(restaurantId: string, utc: number) {
  const response = await fetch('/api/osm/match', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restaurantId, utc }),
  })
  return response.ok
    ? ((await response.json()) as { matched: string | null; fields?: string[] })
    : null
}

/** Save the facts the restaurant's own website publishes onto its profile (monthly at most). */
export async function matchSiteData(restaurantId: string, utc: number) {
  const response = await fetch('/api/site-info', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restaurantId, utc }),
  })
  return response.ok ? ((await response.json()) as { applied: string[]; skipped?: boolean; budget?: boolean }) : null
}

export type Insights = {
  visits: number
  groups: number
  per_head: number | null
  takeout_share: number | null
  /** #147 #145 #146 (after the batch-22 database update) */
  lunch_per_head?: number | null
  dinner_per_head?: number | null
  typical_wait?: number | null
  busy?: { dow: number; meal: 'breakfast' | 'lunch' | 'dinner' | 'late'; n: number }[] | null
}
/** Totals from every group's visits (never per group). */
export async function loadInsights(supabase: any, restaurantId: string): Promise<Insights | null> {
  const { data, error } = await supabase.rpc('restaurant_insights', { target: restaurantId })
  return error ? null : data
}

export type Contributions = {
  facts: number
  dishes: number
  checks: number
  restaurants: number
  verified: number
  points: number
  tier: number
  today?: number
  daily_cap?: number
  /** all points ever (only the last `window_days` count towards the tier) */
  lifetime?: number
  /** points that stop counting in the next 30 days */
  expiring?: number
  window_days?: number
  /** today's allowances at this tier, from the server (ai, explore, menu_import, google) */
  allowances?: Record<string, number>
  /** what earns points right now (Admin → Points) */
  rules?: PointRules
  /** your menu dishes in the points queue (initial point given, waiting for confirmation) */
  menu_active?: number
  /** your menu dishes waiting in line for a spot in the points queue */
  menu_waiting?: number
  /** restaurants this person is the confirmed owner/manager of */
  manages?: string[]
  /** #171 today's caps at your tier (null = unlimited) and what you've used */
  caps?: MyCaps
}
export type MyCaps = {
  tier: number
  shaky: boolean
  fact: number | null
  vote: number | null
  price: number | null
  used: { fact: number; vote: number; price: number }
}

export type Question = {
  field: FactField
  /**
   * missing · unowned (only Google's — can't be kept) · unclaimed (one member said it, needs a
   * cross-check) · open_data (OpenStreetMap: fine to use, better to own) · stale (ours, due a re-check)
   */
  reason: 'missing' | 'unowned' | 'unclaimed' | 'open_data' | 'stale'
  checked_at: string | null
}
/**
 * The one quick question for this person about this restaurant (rotates per person).
 * `skip` = details this phone can't answer right now (the map pin when you're not there).
 */
export async function nextQuestion(
  supabase: any,
  restaurantId: string,
  skip: FactField[] = [],
): Promise<Question | null> {
  const { data, error } = await supabase.rpc('next_question', { target: restaurantId, skip })
  return error ? null : (data ?? null)
}
/** "Not now" (a week) / "Not sure" (three months): don't ask this person again for a while. */
export async function skipQuestion(
  supabase: any,
  restaurantId: string,
  fact: FactField,
  days: number,
) {
  await supabase.rpc('skip_question', { target: restaurantId, fact, days })
}

export async function claimRestaurant(
  supabase: any,
  restaurantId: string,
  form: { contact: string; job: string; mail: string; tel: string; evidence: string },
  /** from the public page: claim without having saved it to a group (admins still check it) */
  direct = false,
) {
  const { error } = await supabase.rpc(direct ? 'claim_restaurant_direct' : 'claim_restaurant', {
    target: restaurantId,
    ...form,
  })
  if (error) throw error
}

/** Can owners claim their page right now? Readable signed out (the public /r/… page asks). */
export async function claimsOpen(supabase: any) {
  const { data, error } = await supabase.rpc('claims_open')
  return !error && data === true
}

export async function myContributions(supabase: any) {
  const { data, error } = await supabase.rpc('my_contributions')
  if (error) return null
  return data as Contributions
}

export async function searchRestaurants(
  supabase: any,
  q: string,
  near: { lat: number; lng: number } | null,
) {
  const { data, error } = await supabase.rpc('search_restaurants', {
    q,
    lat: near?.lat ?? null,
    lng: near?.lng ?? null,
  })
  if (error) return []
  return (data ?? []) as Restaurant[]
}

export async function findRestaurant(supabase: any, sourceKey: string): Promise<Restaurant | null> {
  const { data } = await supabase
    .from('restaurants')
    .select('*')
    .eq('source_key', sourceKey)
    .maybeSingle()
  return data ?? null
}

// ---------- "Your restaurants" (verified owners) ----------
export type OwnedRestaurant = {
  id: string
  name: string
  address: string | null
  saves: number
  dishes: number
  flagged: number
  suggestions: number
}
export type Suggestion = {
  field: FactField | 'dish_price'
  value: unknown
  people: number
  photo: boolean
  latest: string
  /** dish_price only */
  dish_id?: string
  dish?: string
  current?: number | null
}

export async function myRestaurants(supabase: any): Promise<OwnedRestaurant[]> {
  const { data, error } = await supabase.rpc('my_restaurants')
  return error ? [] : (data ?? [])
}
export async function ownerSuggestions(supabase: any, restaurantId: string): Promise<Suggestion[]> {
  const { data, error } = await supabase.rpc('owner_suggestions', { target: restaurantId })
  if (error) throw error
  return data ?? []
}
/** The owner looked at what members suggested and their own detail stands. */
export async function keepOwnerValue(supabase: any, restaurantId: string, fact: FactField) {
  const { error } = await supabase.rpc('keep_owner_value', { target: restaurantId, fact })
  if (error) throw error
}
export async function ownerEditDish(
  supabase: any,
  dishId: string,
  change: { name?: string; price?: number | null; course?: MenuDish['course'] } | 'remove',
) {
  const { error } = await supabase.rpc('owner_edit_dish', {
    target_dish: dishId,
    new_name: change === 'remove' ? null : (change.name ?? null),
    new_price: change === 'remove' ? null : (change.price ?? null),
    new_course: change === 'remove' ? null : (change.course ?? null),
    remove: change === 'remove',
  })
  if (error) throw error
}

/**
 * A member says a dish costs something else. Used straight away if there was no price, once two
 * people say the same new price, or sent to the owner on a dish the owner checked.
 */
export async function suggestDishPrice(
  supabase: any,
  dishId: string,
  price: number,
  how: 'in_person' | 'photo' = 'in_person',
): Promise<{ applied: boolean; agree?: number; sent?: boolean }> {
  const { data, error } = await supabase.rpc('suggest_dish_price', {
    target_dish: dishId,
    new_price: price,
    how,
  })
  if (error) throw error
  return data
}
/** The owner keeps their own price for a dish members suggested a different one for. */
export async function keepDishPrice(supabase: any, dishId: string) {
  const { error } = await supabase.rpc('keep_dish_price', { target_dish: dishId })
  if (error) throw error
}
/**
 * Owner away 30+ days and 3+ people (2+ groups) said the same thing for 2+ weeks → it's applied.
 * Cheap; runs when someone opens a Verified-by-Owner page. Returns how many things changed.
 */
export async function settleOwnerSuggestions(supabase: any, restaurantId: string) {
  const { data, error } = await supabase.rpc('settle_owner_suggestions', { target: restaurantId })
  return error ? 0 : Number(data ?? 0)
}
