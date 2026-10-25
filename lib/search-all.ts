// #225 Search everything: while you type in the Places search box, matching dishes, lists, plans
// and home meals show grouped under it (places themselves are the list below).
import type { HomeMeal, List, Place } from '../hooks/use-crumbs-data'

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
