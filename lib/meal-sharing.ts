// Round 81: recipes belong to the person who added them. A recipe lives in its owner's My Crumbs
// and shows in every group they share it with (the same recipe, so edits show everywhere).
import type { HomeMeal } from '@/hooks/use-crumbs-data'

/** This space's own recipes plus the ones shared into it, newest first, each once. */
export function withSharedMeals(
  own: HomeMeal[],
  shared: { home_meals: HomeMeal | null }[] | null | undefined,
): HomeMeal[] {
  const seen = new Set(own.map((m) => m.id))
  const extra = (shared ?? [])
    .map((row) => row.home_meals)
    .filter((m): m is HomeMeal => !!m && !seen.has(m.id) && (seen.add(m.id), true))
  if (!extra.length) return own
  return [...own, ...extra].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

/** Only whoever added a recipe edits it; one whose owner left Crumbs, its own space can. */
export function canEditMeal(
  meal: Pick<HomeMeal, 'created_by' | 'group_id'>,
  userId: string | undefined,
  groupId: string,
) {
  if (!userId) return false
  return meal.created_by ? meal.created_by === userId : meal.group_id === groupId
}

/** Shown here because its owner shared it in (it lives in their own space). */
export const sharedIn = (meal: Pick<HomeMeal, 'group_id'>, groupId: string) =>
  meal.group_id !== groupId
