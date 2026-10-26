// Home cooking helpers shared by the Home tab and the meal page.
import type { HomeMeal, Ingredient } from '../hooks/use-crumbs-data'

export const MEAL_KINDS = [
  'Breakfast',
  'Main',
  'Side',
  'Soup',
  'Salad',
  'Snack',
  'Dessert',
  'Baking',
  'Drink',
  'Sauce',
] as const

export const CUISINES = [
  'American',
  'Afghan',
  'Caribbean',
  'Chinese',
  'Ethiopian',
  'French',
  'Greek',
  'Indian',
  'Italian',
  'Japanese',
  'Korean',
  'Lebanese',
  'Mexican',
  'Middle Eastern',
  'Portuguese',
  'Spanish',
  'Thai',
  'Turkish',
  'Vietnamese',
]

export const UNITS = [
  '',
  'g',
  'kg',
  'ml',
  'L',
  'tsp',
  'tbsp',
  'cup',
  'oz',
  'lb',
  'pinch',
  'clove',
  'can',
  'slice',
  'bunch',
  'whole',
]

export const mealAverage = (meal: HomeMeal) =>
  meal.home_meal_ratings.length
    ? meal.home_meal_ratings.reduce((sum, r) => sum + r.score, 0) / meal.home_meal_ratings.length
    : 0

export const lastCooked = (meal: HomeMeal) =>
  meal.home_meal_cooks
    .map((cook) => cook.cooked_on)
    .sort()
    .at(-1) ?? null

export function safeUrl(url: string | null | undefined) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null
  } catch {
    return null
  }
}

/** "2 cup flour" → "2 cups flour"; blank parts are skipped. */
export function ingredientText(i: Ingredient) {
  const n = Number(i.qty)
  const unit =
    i.unit &&
    i.unit !== 'whole' &&
    n > 1 &&
    ['cup', 'clove', 'can', 'slice', 'bunch', 'pinch'].includes(i.unit)
      ? `${i.unit}s`
      : i.unit === 'whole'
        ? ''
        : i.unit
  return [i.qty.trim(), unit, i.item.trim()].filter(Boolean).join(' ')
}

/** A row can be added once it has an amount and what it is (the measure is optional: "2 eggs"). */
export const ingredientReady = (i: Ingredient) => !!i.qty.trim() && !!i.item.trim()

/** Steps typed one per line (numbers or bullets at the start are tidied away). */
export const stepsOf = (text?: string | null) =>
  (text ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
