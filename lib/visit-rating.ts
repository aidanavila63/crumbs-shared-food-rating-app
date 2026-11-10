// #113b Your rating for a place comes from your visits: score each visit and the recent ones count
// most (a visit's weight halves every 6 months). #147/#146 meal times and busy times, #145 waits.
import type { PlaceVisit } from '../hooks/use-crumbs-data'

export const HALF_LIFE_DAYS = 180

/** Recency-weighted average (0-5) of your scored visits, or null if you haven't scored any. */
export function ratingFromVisits(
  visits: Pick<PlaceVisit, 'visited_on' | 'score' | 'created_by'>[],
  userId: string | undefined,
  now = new Date(),
) {
  const mine = visits.filter((v) => v.created_by === userId && typeof v.score === 'number')
  if (!mine.length) return null
  let sum = 0
  let weights = 0
  for (const v of mine) {
    const age = Math.max(
      0,
      (now.getTime() - new Date(`${v.visited_on}T12:00:00`).getTime()) / 864e5,
    )
    const w = 0.5 ** (age / HALF_LIFE_DAYS)
    sum += Number(v.score) * w
    weights += w
  }
  const value = sum / weights
  return { value, count: mine.length }
}

/** The rating row for that value: points 0-100 and whole stars 1-5. */
export function ratingRow(value: number) {
  const points = Math.max(0, Math.min(100, Math.round(value * 20)))
  return { points, score: Math.max(1, Math.min(5, Math.round(value))) }
}

export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'late'
export const MEAL_TIMES: { id: MealTime; label: string }[] = [
  { id: 'breakfast', label: '🥐 Breakfast' },
  { id: 'lunch', label: '🥪 Lunch' },
  { id: 'dinner', label: '🍝 Dinner' },
  { id: 'late', label: '🌙 Late' },
]
/** Best guess from the clock: before 11 breakfast, before 4 lunch, before 9 dinner, then late. */
export function mealTimeAt(date = new Date()): MealTime {
  const h = date.getHours()
  if (h >= 4 && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 16 && h < 21) return 'dinner'
  return 'late'
}

export const WAITS = [
  { minutes: 0, label: 'No wait' },
  { minutes: 10, label: '~10 min' },
  { minutes: 20, label: '~20 min' },
  { minutes: 40, label: '30+ min' },
]

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WHEN: Record<MealTime, string> = {
  breakfast: 'mornings',
  lunch: 'lunchtimes',
  dinner: 'evenings',
  late: 'late nights',
}

/** "Usually busy Fri–Sat evenings" from busy slots (day of week + meal time, with counts). */
export function busyText(busy: { dow: number; meal: MealTime; n: number }[] | null | undefined) {
  if (!busy?.length) return null
  const top = busy[0]
  const days = busy
    .filter((b) => b.meal === top.meal && b.n >= top.n * 0.6)
    .map((b) => b.dow)
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // Monday first
  const run =
    days.length > 1 && days.every((d, i) => i === 0 || (days[i - 1] + 1) % 7 === d)
      ? `${DAY[days[0]]}–${DAY[days.at(-1)!]}`
      : days.map((d) => DAY[d]).join(', ')
  return `Usually busy ${run} ${WHEN[top.meal]}`
}

/** "~15 min wait" (0 → "Usually no wait"). */
export const waitText = (minutes: number | null | undefined) =>
  minutes === null || minutes === undefined
    ? null
    : minutes <= 2
      ? 'Usually no wait'
      : `Usual wait ~${minutes} min`

/**
 * What a visit here usually costs, from the group's earlier visits: the middle (median) amount
 * per person, scaled to `people` when that's known, else the middle total. Needs at least two
 * visits with an amount; returns null otherwise.
 */
export function usualSpend(
  visits: { spend: number | null; people?: number | null }[] | undefined,
  people: number | null,
): number | null {
  const paid = (visits ?? []).filter((v) => typeof v.spend === 'number' && v.spend > 0)
  if (paid.length < 2) return null
  const middle = (nums: number[]) => {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  const heads = paid.filter((v) => (v.people ?? 0) > 0)
  if (people && people > 0 && heads.length >= 2)
    return Math.round(middle(heads.map((v) => (v.spend as number) / (v.people as number))) * people)
  return Math.round(middle(paid.map((v) => v.spend as number)))
}
