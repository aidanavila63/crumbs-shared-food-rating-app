// Round 90: "Make my own version" of a recipe, with the credit line. The database does the copy
// (make_my_version), keeps the credit (recipe_guard) and blocks near-copies going on Crumbs.

/** "Based on Ana's Sunday lasagna" / "Based on your Sunday lasagna" / "Based on a recipe by someone" */
export function creditLine(name: string | null | undefined, by: string | null | undefined) {
  if (!name) return null
  const who = (by ?? '').trim()
  if (who === 'you') return `Based on your ${name}`
  if (!who || who === 'someone') return `Based on someone’s ${name}`
  return `Based on ${who}’s ${name}`
}

/** The database said this is nearly the same as a recipe already on Crumbs (or its original). */
export const isTwinError = (message: string | null | undefined) =>
  /nearly the same as/i.test(message ?? '')

export type RecipeCredit = {
  name: string
  by: string
  original: {
    id: string
    name: string
    ingredients: { qty: string; unit: string; item: string }[] | null
    recipe: string | null
    recipe_url: string | null
  } | null
}

/** A demo-mode copy (no database): same recipe, yours, not on Crumbs, credited. */
export function demoVersion<
  T extends { id: string; name: string; created_by: string | null; recipe_public?: boolean | null },
>(meal: T, personalGroupId: string, userId: string, now = new Date()) {
  return {
    ...meal,
    id: `demo-version-${now.getTime()}`,
    group_id: personalGroupId,
    created_by: userId,
    status: 'Want to cook',
    verdict: null,
    notes: null,
    photo_path: null,
    recipe_public: false,
    based_on: meal.id,
    based_on_name: meal.name,
    based_on_by: meal.created_by,
    created_at: now.toISOString(),
    home_meal_ratings: [],
    home_meal_cooks: [],
  }
}
