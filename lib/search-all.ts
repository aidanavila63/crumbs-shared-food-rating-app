// #225 Search everything: while you type in the Places search box, matching dishes, lists, plans
// and home meals show grouped under it (places themselves are the list below).
import type { HomeMeal, List, Place } from '../hooks/use-crumbs-data'

// Searching a broad word finds the cuisines under it ("asian" → ramen, thai, sushi…).
const FAMILIES: Record<string, string[]> = {
  asian: [
    'chinese',
    'japanese',
    'korean',
    'thai',
    'vietnamese',
    'filipino',
    'malaysian',
    'indonesian',
    'taiwanese',
    'sushi',
    'ramen',
    'pho',
    'dim sum',
    'izakaya',
    'noodle',
    'dumpling',
    'hot pot',
    'bubble tea',
    'asian',
  ],
  'south asian': [
    'indian',
    'pakistani',
    'bangladeshi',
    'sri lankan',
    'nepalese',
    'afghani',
    'afghan',
  ],
  'middle eastern': [
    'lebanese',
    'turkish',
    'persian',
    'iranian',
    'israeli',
    'syrian',
    'shawarma',
    'falafel',
    'afghani',
    'afghan',
    'kebab',
    'kabob',
  ],
  european: [
    'italian',
    'french',
    'spanish',
    'greek',
    'portuguese',
    'german',
    'british',
    'irish',
    'polish',
  ],
  latin: [
    'mexican',
    'peruvian',
    'brazilian',
    'colombian',
    'salvadoran',
    'cuban',
    'venezuelan',
    'argentinian',
    'tacos',
    'burrito',
  ],
  african: ['ethiopian', 'eritrean', 'nigerian', 'ghanaian', 'moroccan', 'somali', 'jamaican'],
  caribbean: ['jamaican', 'trinidadian', 'haitian', 'cuban'],
  seafood: ['fish', 'sushi', 'oyster', 'seafood', 'poke'],
  dessert: ['bakery', 'ice cream', 'gelato', 'dessert', 'cake', 'pastry', 'donut', 'crepe'],
  breakfast: ['brunch', 'breakfast', 'cafe', 'café', 'bagel', 'pancake'],
  'fast food': ['burger', 'fried chicken', 'chicken', 'pizza', 'fast food', 'hot dog', 'fries'],
}

/** Extra words a place's cuisine also answers to (its families), lowercased. */
export function cuisineWords(cuisine?: string | null) {
  if (!cuisine) return ''
  const c = cuisine.toLowerCase()
  return Object.entries(FAMILIES)
    .filter(([, members]) => members.some((m) => c.includes(m)))
    .map(([family]) => family)
    .join(' ')
}

type PlanLike = { id: string; title: string; place_id: string | null; starts_at: string | null }

export function searchAll(
  query: string,
  data: { places: Place[]; lists: List[]; meals: HomeMeal[]; plans: PlanLike[] },
  limit = 5,
) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return null
  const has = (...texts: (string | null | undefined)[]) =>
    texts.some((t) => t?.toLowerCase().includes(q))
  const dishes = data.places
    .flatMap((place) => (place.dishes ?? []).map((dish) => ({ dish, place })))
    .filter(({ dish }) => has(dish.name, dish.description, ...(dish.tags ?? [])))
    .slice(0, limit)
  const lists = data.lists.filter((l) => has(l.name, l.trip_city)).slice(0, limit)
  const plans = data.plans
    .filter((p) => has(p.title, data.places.find((x) => x.id === p.place_id)?.name))
    .slice(0, limit)
  const meals = data.meals.filter((m) => has(m.name, m.notes, m.recipe)).slice(0, limit)
  const total = dishes.length + lists.length + plans.length + meals.length
  return total ? { dishes, lists, plans, meals } : null
}
