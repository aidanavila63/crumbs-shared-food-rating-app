// U9 (Round 88): recipe upgrades — scaling amounts, reading an ingredient line, and reading a
// recipe from a web page's own recipe data (schema.org "Recipe", which most recipe sites publish
// for search engines). No AI: only what the page itself declares.
import type { Ingredient } from '../hooks/use-crumbs-data'
import { UNITS } from './meals.ts'

const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
}

/** "1 1/2" → 1.5, "½" → 0.5, "2.5" → 2.5; null when it isn't a plain amount. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/([0-9])([½⅓⅔¼¾⅛])/, '$1 $2')
  if (!t) return null
  let total = 0
  for (const part of t.split(/\s+/)) {
    if (FRACTIONS[part] !== undefined) total += FRACTIONS[part]
    else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number)
      if (!b) return null
      total += a / b
    } else if (/^\d+(\.\d+)?$/.test(part)) total += Number(part)
    else return null
  }
  return total
}

const NICE: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
]

/** 1.5 → "1½", 0.333 → "⅓", 2.4 → "2.4" */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const whole = Math.floor(n + 1e-9)
  const rest = n - whole
  if (rest < 0.04) return String(whole)
  const near = NICE.find(([v]) => Math.abs(rest - v) < 0.04)
  if (near) return whole ? `${whole}${near[1]}` : near[1]
  return String(Math.round(n * 10) / 10)
}

/** An amount scaled by a factor: "1 1/2" × 2 → "3"; ranges "2-3" scale both ends; anything else stays. */
export function scaleQty(qty: string, factor: number): string {
  if (!qty.trim() || factor === 1) return qty
  const range = qty.split(/\s*[-–]\s*/)
  if (range.length === 2) {
    const [a, b] = range.map(parseAmount)
    if (a !== null && b !== null) return `${formatAmount(a * factor)}–${formatAmount(b * factor)}`
  }
  const n = parseAmount(qty)
  return n === null ? qty : formatAmount(n * factor)
}

export const scaleIngredients = (list: Ingredient[], factor: number) =>
  list.map((i) => ({ ...i, qty: scaleQty(i.qty, factor) }))

const UNIT_WORDS: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'L',
  litre: 'L',
  liter: 'L',
  litres: 'L',
  liters: 'L',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbs: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  pinch: 'pinch',
  pinches: 'pinch',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  slice: 'slice',
  slices: 'slice',
  bunch: 'bunch',
  bunches: 'bunch',
}

/** "2 cups flour" → { qty: "2", unit: "cup", item: "flour" }; unknown measures stay in the item. */
export function parseIngredientLine(line: string): Ingredient {
  const text = line.replace(/\s+/g, ' ').trim().slice(0, 160)
  const m =
    /^((?:\d+(?:[./]\d+)?|[½⅓⅔¼¾⅛])(?:\s*[½⅓⅔¼¾⅛]|\s+\d+\/\d+)?(?:\s*[-–]\s*\d+(?:[./]\d+)?)?)\s*(.*)$/.exec(
      text,
    )
  if (!m) return { qty: '', unit: '', item: text }
  const qty = m[1].replace(/\s+/g, ' ').trim()
  const rest = m[2]
  const word = /^([A-Za-z]+)\.?\s+(.*)$/.exec(rest)
  const unit = word ? UNIT_WORDS[word[1].toLowerCase()] : undefined
  if (word && unit && UNITS.includes(unit)) return { qty, unit, item: word[2].trim() }
  return { qty, unit: '', item: rest.trim() }
}

/** "PT1H15M" → 75 */
export function isoMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(value.trim())
  if (!m) return null
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total > 0 && total <= 2880 ? total : null
}

export type ImportedRecipe = {
  name: string
  ingredients: Ingredient[]
  steps: string
  servings: number | null
  prep_minutes: number | null
  cook_minutes: number | null
}

const clean = (s: unknown) =>
  typeof s === 'string'
    ? s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
    : ''

function findRecipe(node: any): any {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findRecipe(item)
      if (hit) return hit
    }
    return null
  }
  const type = node['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node
  return findRecipe(node['@graph'])
}

function stepsFrom(value: any, out: string[] = []): string[] {
  if (!value) return out
  if (typeof value === 'string') {
    for (const line of value.split(/\n+/)) if (clean(line)) out.push(clean(line))
  } else if (Array.isArray(value)) value.forEach((v) => stepsFrom(v, out))
  else if (typeof value === 'object') {
    if (value.itemListElement) stepsFrom(value.itemListElement, out)
    else if (value.text) out.push(clean(value.text))
    else if (value.name) out.push(clean(value.name))
  }
  return out
}

/** The recipe a page declares (JSON-LD), or null. */
export function readRecipe(html: string): ImportedRecipe | null {
  const blocks =
    html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? []
  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')
    let data: any
    try {
      data = JSON.parse(json)
    } catch {
      continue
    }
    const r = findRecipe(data)
    if (!r) continue
    const name = clean(r.name).slice(0, 120)
    if (!name) continue
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : [])
      .map((line: unknown) => clean(line))
      .filter(Boolean)
      .slice(0, 80)
      .map(parseIngredientLine)
    const yieldText = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield
    const servings = parseInt(String(yieldText ?? ''), 10)
    return {
      name,
      ingredients,
      steps: stepsFrom(r.recipeInstructions).join('\n').slice(0, 6000),
      servings: servings > 0 && servings <= 50 ? servings : null,
      prep_minutes: isoMinutes(r.prepTime),
      cook_minutes: isoMinutes(r.cookTime) ?? isoMinutes(r.totalTime),
    }
  }
  return null
}
