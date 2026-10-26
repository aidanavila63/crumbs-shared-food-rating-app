// Dishes & ratings round: #112 reasons, #119 order for the table, #121 safe for me, #181 spice.
// All worked out on the phone from your group's own data (free).
import type { Dish, Place, Profile } from '../hooks/use-crumbs-data'
import { dishAverage } from './stats.ts'

// ---------- #112 reasons ----------
// Why the score is what it is (food, service, value, speed). Vibes and amenities (Cozy, Patio,
// Loud…) are the place's tags instead, so the two rows never repeat each other.
export const REASONS = {
  good: ['Great food', 'Great service', 'Good value', 'Big portions', 'Fast', 'Fresh'],
  bad: ['Too salty', 'Bland', 'Slow', 'Pricey', 'Small portions', 'Bad service'],
}
const REASON_SET = new Set([...REASONS.good, ...REASONS.bad, 'Quick'].map((r) => r.toLowerCase()))
/** True for tags that are really reasons (kept out of the vibes row). */
export const isReasonTag = (tag: string) => REASON_SET.has(tag.trim().toLowerCase())
export const MAX_REASONS = 4

/** "Known for" line: reasons picked by 2+ people (or twice), most picked first, max 3. */
export function knownFor(place: Pick<Place, 'place_ratings'>, min = 2) {
  const tally = new Map<string, number>()
  for (const r of place.place_ratings)
    for (const reason of r.reasons ?? []) tally.set(reason, (tally.get(reason) ?? 0) + 1)
  return [...tally.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([reason]) => reason)
}

// ---------- #181 spice ----------
type Person = Pick<Profile, 'display_name' | 'spice_max'>
/** First names of people a dish is hotter than they like. */
export function tooHotFor(dish: Pick<Dish, 'spice'>, people: Person[]) {
  if (!dish.spice) return []
  return people
    .filter((p) => p.spice_max !== null && p.spice_max !== undefined && dish.spice! > p.spice_max)
    .map((p) => (p.display_name || 'Someone').split(' ')[0])
}

// ---------- #121 safe for me ----------
export type Fit = 'fits' | 'avoid' | 'unknown'
type Me = Pick<Profile, 'avoid' | 'diet'>
/** Avoid = tagged with an allergen you avoid; fits = matches every diet you follow and has none of
 *  your allergens reported; unknown = nobody has said. People's reports only — not a promise. */
export function fitsMe(dish: Pick<Dish, 'tags' | 'dietary'>, me: Me): Fit {
  const tags = (dish.tags ?? []).map((t) => t.toLowerCase())
  const avoid = (me.avoid ?? []).filter((a) => a.startsWith('a:')).map((a) => a.slice(2))
  if (avoid.some((a) => tags.includes(a))) return 'avoid'
  const diet = me.diet ?? []
  if (!diet.length) return avoid.length ? 'fits' : 'unknown'
  return diet.every((d) => (dish.dietary ?? []).includes(d)) ? 'fits' : 'unknown'
}

/** Dishes across all your places that fit you, best rated first. */
export function safeDishes(places: Place[], me: Me, limit = 20) {
  return places
    .flatMap((place) =>
      (place.dishes ?? [])
        .filter((dish) => dish.verdict !== 'never' && fitsMe(dish, me) === 'fits')
        .map((dish) => ({ dish, place, points: dishAverage(dish) })),
    )
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1))
    .slice(0, limit)
}

// ---------- #119 order for the table ----------
export type TablePick = { dish: Dish; why: string }
/** Must-tries and favourites for `people`: about one main each, a starter or side per two, a
 *  dessert per three. Skips "never again" and anything someone at the table avoids. */
export function orderForTable(
  dishes: Dish[],
  people: number,
  avoids: (dish: Dish) => boolean = () => false,
) {
  const n = Math.max(1, Math.min(20, Math.round(people)))
  const ok = dishes.filter((d) => d.verdict !== 'never' && !avoids(d))
  const rank = (d: Dish) =>
    (dishAverage(d) ?? 50) +
    (d.verdict === 'again' ? 15 : 0) +
    ((d.tags ?? []).includes('shareable') ? 8 : 0) +
    (d.wishlist ? 5 : 0)
  const sorted = [...ok].sort((a, b) => rank(b) - rank(a))
  const want: [Dish['course'] | 'any', number][] = [
    ['starter', Math.ceil(n / 2)],
    ['main', n],
    ['dessert', Math.floor(n / 3)],
  ]
  const picks: TablePick[] = []
  const taken = new Set<string>()
  const take = (d: Dish) => {
    taken.add(d.id)
    const points = dishAverage(d)
    picks.push({
      dish: d,
      why:
        d.verdict === 'again'
          ? 'You’d order it again'
          : points !== null
            ? `${points}/100`
            : d.wishlist
              ? 'On your want-to-try list'
              : 'Not rated yet',
    })
  }
  const hasCourses = ok.some((d) => d.course)
  if (hasCourses)
    for (const [course, count] of want) {
      const pool = sorted.filter(
        (d) =>
          !taken.has(d.id) &&
          (d.course === course ||
            (course === 'starter' && d.course === 'side') ||
            (course === 'main' && !d.course)),
      )
      pool.slice(0, count).forEach(take)
    }
  // No courses known (or not enough mains): fill with the best of what's left.
  const target = hasCourses ? n : n + Math.ceil(n / 2)
  sorted
    .filter((d) => !taken.has(d.id) && d.course !== 'drink')
    .slice(0, Math.max(0, target - picks.filter((p) => p.dish.course !== 'dessert').length))
    .forEach(take)
  const priced = picks.filter((p) => p.dish.price !== null && p.dish.price !== undefined)
  const total = priced.reduce((sum, p) => sum + Number(p.dish.price), 0)
  return {
    picks,
    total: priced.length ? Math.round(total) : null,
    perHead: priced.length ? Math.round(total / n) : null,
    missingPrices: picks.length - priced.length,
  }
}

/** Text to share: "Order for the table at Hana Ramen (4 people) …". */
export function tableText(
  placeName: string,
  people: number,
  order: ReturnType<typeof orderForTable>,
) {
  const lines = order.picks.map(
    (p) =>
      `• ${p.dish.name}${p.dish.price != null ? ` ($${Number(p.dish.price).toFixed(0)})` : ''}`,
  )
  const cost =
    order.total !== null
      ? `\nAbout $${order.total} before tax and tip (~$${order.perHead} each)${order.missingPrices ? `, ${order.missingPrices} without a price` : ''}`
      : ''
  return `🍽️ Order for the table at ${placeName} (${people} ${people === 1 ? 'person' : 'people'})\n${lines.join('\n')}${cost}\n— from Crumbs`
}

// ---------- #119 v2: the saved table order (shareables) ----------
export type OrderItem = { dish_id: string; qty: number }

/** Total before tax and tip, each person's share, and roughly how many people it feeds. */
export function orderTotals(items: OrderItem[], dishes: Dish[], people: number) {
  let total = 0
  let unpriced = 0
  let feeds = 0
  for (const item of items) {
    const dish = dishes.find((d) => d.id === item.dish_id)
    if (!dish || item.qty <= 0) continue
    if (dish.price != null) total += Number(dish.price) * item.qty
    else unpriced += item.qty
    feeds += (dish.shares ?? 1) * item.qty
  }
  const n = Math.max(1, people)
  return {
    total: Math.round(total * 100) / 100,
    each: Math.round((total / n) * 100) / 100,
    unpriced,
    feeds,
  }
}

/** Starting suggestion as order items (one of each pick). */
export function suggestedItems(dishes: Dish[], people: number, avoids?: (dish: Dish) => boolean) {
  return orderForTable(dishes, people, avoids).picks.map((p) => ({ dish_id: p.dish.id, qty: 1 }))
}

/** Text to share for a saved order. */
export function orderText(placeName: string, people: number, items: OrderItem[], dishes: Dish[]) {
  const t = orderTotals(items, dishes, people)
  const lines = items
    .map((item) => ({ item, dish: dishes.find((d) => d.id === item.dish_id) }))
    .filter((x) => x.dish && x.item.qty > 0)
    .map(
      ({ item, dish }) =>
        `• ${item.qty > 1 ? `${item.qty}× ` : ''}${dish!.name}${dish!.price != null ? ` ($${(Number(dish!.price) * item.qty).toFixed(0)})` : ''}${dish!.shares && dish!.shares > 1 ? ` — shares ${dish!.shares}` : ''}`,
    )
  const cost = t.total
    ? `\nAbout $${t.total.toFixed(0)} before tax and tip · ~$${t.each.toFixed(0)} each${t.unpriced ? ` (+${t.unpriced} without a price)` : ''}`
    : ''
  return `🍽️ Our order at ${placeName} (${people} ${people === 1 ? 'person' : 'people'})\n${lines.join('\n')}${cost}\n— from Crumbs`
}
