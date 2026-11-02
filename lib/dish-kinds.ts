// #178 "Best ramen", "Best burger": dishes grouped by what they are (from the dish name and its
// tags), so the group can rank like-for-like across all its places. Free, worked out on the phone.
import type { Place } from '../hooks/use-crumbs-data'
import { dishAverage } from './stats.ts'

export const DISH_KINDS: { id: string; label: string; emoji: string; words: RegExp }[] = [
  {
    id: 'ramen',
    label: 'Ramen',
    emoji: '🍜',
    words: /\b(ramen|tonkotsu|shoyu|miso ramen|tsukemen)\b/i,
  },
  { id: 'pho', label: 'Pho', emoji: '🍲', words: /\bph[oở]\b/i },
  { id: 'burger', label: 'Burgers', emoji: '🍔', words: /\b(burger|cheeseburger|smash)\b/i },
  { id: 'pizza', label: 'Pizza', emoji: '🍕', words: /\b(pizza|margherita|pepperoni|calzone)\b/i },
  { id: 'taco', label: 'Tacos', emoji: '🌮', words: /\b(tacos?|al pastor|birria|carnitas)\b/i },
  { id: 'burrito', label: 'Burritos', emoji: '🌯', words: /\b(burrito|wrap|shawarma|gyro)\b/i },
  { id: 'sushi', label: 'Sushi', emoji: '🍣', words: /\b(sushi|maki|nigiri|sashimi|roll|poke)\b/i },
  {
    id: 'curry',
    label: 'Curry',
    emoji: '🍛',
    words: /\b(curry|khao soi|tikka|masala|korma|vindaloo|biryani)\b/i,
  },
  {
    id: 'noodles',
    label: 'Noodles',
    emoji: '🥢',
    words: /\b(noodles?|pad thai|udon|soba|lo mein|chow mein|dan dan)\b/i,
  },
  {
    id: 'pasta',
    label: 'Pasta',
    emoji: '🍝',
    words: /\b(pasta|spaghetti|carbonara|lasagna|linguine|penne|rigatoni|gnocchi|ravioli)\b/i,
  },
  {
    id: 'dumplings',
    label: 'Dumplings',
    emoji: '🥟',
    words: /\b(dumplings?|gyoza|bao|xiao long|momo|dim sum|wontons?|pierogi)\b/i,
  },
  {
    id: 'chicken',
    label: 'Fried chicken & wings',
    emoji: '🍗',
    words: /\b(wings?|fried chicken|karaage|tenders|nuggets)\b/i,
  },
  {
    id: 'sandwich',
    label: 'Sandwiches',
    emoji: '🥪',
    words: /\b(sandwich|banh mi|sub|panini|hoagie|club)\b/i,
  },
  {
    id: 'steak',
    label: 'Steak',
    emoji: '🥩',
    words: /\b(steak|ribeye|striploin|sirloin|filet|brisket)\b/i,
  },
  { id: 'salad', label: 'Salads', emoji: '🥗', words: /\b(salad|bowl)\b/i },
  { id: 'fries', label: 'Fries', emoji: '🍟', words: /\b(fries|poutine|chips)\b/i },
  {
    id: 'breakfast',
    label: 'Breakfast',
    emoji: '🥞',
    words: /\b(pancakes?|waffles?|benedict|french toast|omelette|eggs)\b/i,
  },
  {
    id: 'dessert',
    label: 'Sweet stuff',
    emoji: '🍰',
    words:
      /\b(cake|ice cream|gelato|cheesecake|tiramisu|brownie|cookie|pie|donut|churros?|mochi)\b/i,
  },
  {
    id: 'coffee',
    label: 'Coffee',
    emoji: '☕',
    words: /\b(coffee|latte|cappuccino|espresso|americano|flat white|cortado)\b/i,
  },
  {
    id: 'cocktail',
    label: 'Cocktails',
    emoji: '🍸',
    words: /\b(cocktail|margarita|martini|negroni|old fashioned|mojito|spritz)\b/i,
  },
  { id: 'boba', label: 'Bubble tea', emoji: '🧋', words: /\b(boba|bubble tea|milk tea)\b/i },
]

/** The kind of a dish, or null. First match wins, so specific kinds sit above general ones. */
export function dishKind(dish: { name: string; tags?: string[] | null }) {
  const text = [dish.name, ...(dish.tags ?? [])].join(' ')
  return DISH_KINDS.find((k) => k.words.test(text)) ?? null
}

/** Kinds with at least `min` rated dishes, most dishes first. */
export function rankedKinds(places: Place[], min = 2) {
  const tally = new Map<string, number>()
  for (const p of places)
    for (const d of p.dishes ?? []) {
      const kind = dishKind(d)
      if (kind && dishAverage(d) !== null) tally.set(kind.id, (tally.get(kind.id) ?? 0) + 1)
    }
  return DISH_KINDS.filter((k) => (tally.get(k.id) ?? 0) >= min).sort(
    (a, b) => tally.get(b.id)! - tally.get(a.id)!,
  )
}

/** Your best dishes of one kind across all your places. */
export function bestOfKind(places: Place[], kindId: string, limit = 10) {
  return places
    .flatMap((place) =>
      (place.dishes ?? [])
        .filter((dish) => dishKind(dish)?.id === kindId)
        .map((dish) => ({ dish, place, points: dishAverage(dish) })),
    )
    .filter((row): row is typeof row & { points: number } => row.points !== null)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
}
