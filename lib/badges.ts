// Achievements (#53). Everything is worked out from data you already log — nothing is stored.
import type { Place } from '../hooks/use-crumbs-data'
import { allVisits, cuisineBingo } from './stats.ts'
import { visitStreak } from './goals.ts'

export type Badge = {
  id: string
  emoji: string
  title: string
  how: string
  progress: number
  target: number
  earned: boolean
}

export function badges(places: Place[], userId?: string, today = new Date()): Badge[] {
  const visits = allVisits(places)
  const been = places.filter((place) => place.status === 'Been')
  const cuisines = new Set(
    been.map((place) => place.cuisine?.trim().toLowerCase()).filter((c): c is string => !!c),
  )
  const perPlace = new Map<string, number>()
  visits.forEach((visit) => perPlace.set(visit.place_id, (perPlace.get(visit.place_id) ?? 0) + 1))
  const mostAtOnePlace = Math.max(0, ...perPlace.values())
  const myRatings = userId
    ? places.filter((place) => place.place_ratings.some((rating) => rating.user_id === userId))
        .length
    : 0
  const myDishes = userId
    ? places
        .flatMap((place) => place.dishes ?? [])
        .filter((dish) => dish.dish_ratings.some((rating) => rating.user_id === userId)).length
    : 0
  const photos =
    places.filter((place) => place.photo_path).length +
    places.flatMap((place) => place.dishes ?? []).filter((dish) => dish.photo_path).length
  const streak = visitStreak(places, today)
  const bingo = cuisineBingo(places)

  const make = (
    id: string,
    emoji: string,
    title: string,
    how: string,
    progress: number,
    target: number,
  ): Badge => ({
    id,
    emoji,
    title,
    how,
    progress: Math.min(progress, target),
    target,
    earned: progress >= target,
  })

  return [
    make('first-bite', '🍞', 'First crumb', 'Log your first visit', visits.length, 1),
    make('explorer', '🧭', 'Explorer', 'Go to 10 different places', been.length, 10),
    make('regular', '🏠', 'Regular', 'Visit the same place 3 times', mostAtOnePlace, 3),
    make('globetrotter', '🌍', 'Globetrotter', 'Try 5 different cuisines', cuisines.size, 5),
    make('critic', '⭐', 'Critic', 'Rate 25 places', myRatings, 25),
    make('dish-detective', '🍜', 'Dish detective', 'Rate 20 dishes', myDishes, 20),
    make('shutterbug', '📸', 'Shutterbug', 'Add 10 photos', photos, 10),
    make('on-a-roll', '🔥', 'On a roll', 'Keep a 4-week eating-out streak', streak.best, 4),
    make('bingo', '🎯', 'Bingo!', 'Get a cuisine bingo', bingo.bingos, 1),
  ]
}
