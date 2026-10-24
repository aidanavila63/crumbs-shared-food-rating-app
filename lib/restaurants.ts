// Shared restaurant profiles: one copy per real restaurant, reused by every group (#27), with a
// community menu fed by menu photos and website imports (#19). Only facts about the restaurant
// live here — ratings, notes and who goes where stay inside each group.
import type { Hours } from './place-info'

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
}

export type MenuDish = {
  id: string
  restaurant_id: string
  name: string
  name_key: string
  price: number | null
  description: string | null
  course: 'starter' | 'main' | 'side' | 'dessert' | 'drink' | null
  dietary: string[]
  source: 'photo' | 'website' | 'manual'
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
export const priceIsOld = (iso: string, now = Date.now()) => now - new Date(iso).getTime() > 180 * 864e5

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
  how: 'photo' | 'website' | 'manual',
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
