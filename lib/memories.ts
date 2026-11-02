// #69 "On this day" memories and #70 milestones, built from what the group already logged.
import type { HomeMeal, Place } from '../hooks/use-crumbs-data'

export type Memory = {
  key: string
  on: string // yyyy-mm-dd
  yearsAgo: number
  text: string
  placeId?: string
  mealId?: string
}

const md = (iso: string) => iso.slice(5, 10)

/** Things that happened on today's date in earlier years (or within a few days if nothing exact). */
export function onThisDay(places: Place[], meals: HomeMeal[], today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10)
  const year = today.getFullYear()
  const events: Memory[] = []
  places.forEach((place) => {
    ;(place.place_visits ?? []).forEach((visit) =>
      events.push({
        key: `v-${visit.id}`,
        on: visit.visited_on,
        yearsAgo: year - Number(visit.visited_on.slice(0, 4)),
        text: `You went to ${place.name}${visit.occasion === 'date' ? ' for a date' : visit.occasion === 'celebration' ? ' to celebrate' : ''}`,
        placeId: place.id,
      }),
    )
    events.push({
      key: `p-${place.id}`,
      on: place.created_at.slice(0, 10),
      yearsAgo: year - Number(place.created_at.slice(0, 4)),
      text: `You added ${place.name}`,
      placeId: place.id,
    })
  })
  meals.forEach((meal) =>
    meal.home_meal_cooks.forEach((cook) =>
      events.push({
        key: `c-${cook.id}`,
        on: cook.cooked_on,
        yearsAgo: year - Number(cook.cooked_on.slice(0, 4)),
        text: `You cooked ${meal.name}`,
        mealId: meal.id,
      }),
    ),
  )
  const past = events.filter((event) => event.yearsAgo >= 1 && event.on < todayIso)
  const exact = past.filter((event) => md(event.on) === md(todayIso))
  if (exact.length) return exact.sort((a, b) => a.yearsAgo - b.yearsAgo).slice(0, 5)
  // Nothing on the exact day: anything within 3 days either side, a year or more ago.
  const near = past.filter((event) => {
    const then = new Date(`${year}-${md(event.on)}T12:00:00`).getTime()
    return Math.abs(then - new Date(`${todayIso}T12:00:00`).getTime()) <= 3 * 864e5
  })
  return near.sort((a, b) => a.yearsAgo - b.yearsAgo).slice(0, 3)
}

/** Visits marked as a milestone or occasion, newest first. */
export function milestones(places: Place[]) {
  return places
    .flatMap((place) =>
      (place.place_visits ?? [])
        .filter((visit) => visit.milestone || visit.occasion)
        .map((visit) => ({ place, visit })),
    )
    .sort((a, b) => b.visit.visited_on.localeCompare(a.visit.visited_on))
}
