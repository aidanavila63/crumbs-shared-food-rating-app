// Is a Google result somewhere to eat or drink? Used to keep hardware stores, banks and
// street addresses out of place search (searching "Canadian Tire" shouldn't offer the store).
const FOOD = new Set([
  'restaurant',
  'food',
  'cafe',
  'cafeteria',
  'coffee_shop',
  'tea_house',
  'bakery',
  'bagel_shop',
  'donut_shop',
  'dessert_shop',
  'ice_cream_shop',
  'juice_shop',
  'sandwich_shop',
  'confectionery',
  'candy_store',
  'chocolate_shop',
  'deli',
  'diner',
  'bistro',
  'food_court',
  'meal_takeaway',
  'meal_delivery',
  'bar',
  'pub',
  'wine_bar',
  'brewery',
  'brewpub',
  'winery',
  'night_club',
  'bar_and_grill',
  'steak_house',
  'snack_bar',
  'acai_shop',
])

/** True when the types say "food or drink". Unknown (no types) counts as yes. */
export function isFoodPlace(types?: readonly string[] | null) {
  if (!types?.length) return true
  return types.some(
    (t) =>
      FOOD.has(t) ||
      t.endsWith('_restaurant') ||
      t.endsWith('_bar') ||
      t.endsWith('_cafe') ||
      t.endsWith('_bakery'),
  )
}
