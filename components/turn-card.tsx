'use client'
import type { HomeMeal, Place, Profile } from '@/hooks/use-crumbs-data'
import { whoseTurn } from '@/lib/turns'
import { useSocial } from '@/hooks/use-social'

/** #37 Whose turn to pick the restaurant (and to cook, when you log who cooked). */
export function TurnCard({
  places,
  meals,
  members,
  userId,
  names,
}: {
  places: Place[]
  meals: HomeMeal[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
}) {
  const ids = members.map((member) => member.id)
  const name = (id: string) => (id === userId ? 'you' : (names[id] ?? 'someone'))
  const pick = whoseTurn(
    ids,
    places.flatMap((place) =>
      (place.place_visits ?? [])
        .filter((visit) => visit.picked_by)
        .map((visit) => ({ user: visit.picked_by!, on: visit.visited_on, label: place.name })),
    ),
  )
  const cook = whoseTurn(
    ids,
    meals.flatMap((meal) =>
      meal.home_meal_cooks
        .filter((c) => c.cooked_by)
        .map((c) => ({ user: c.cooked_by!, on: c.cooked_on, label: meal.name })),
    ),
  )
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  // #192 kudos on picks: 👏 reactions on visits, counted for whoever picked
  const social = useSocial()
  const kudos = new Map<string, number>()
  for (const place of places)
    for (const visit of place.place_visits ?? [])
      if (visit.picked_by) {
        const n = (social?.reactions ?? []).filter(
          (r) => r.target === `pick:${visit.id}` && r.emoji === '👏',
        ).length
        if (n) kudos.set(visit.picked_by, (kudos.get(visit.picked_by) ?? 0) + n)
      }
  const star = [...kudos.entries()].sort((a, b) => b[1] - a[1])[0]
  return (
    <div className="surface turn-card flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">Whose turn?</h3>
      {pick ? (
        <div className="flex items-center gap-3">
          <span className="turn-avatar" aria-hidden="true">
            🎯
          </span>
          <div>
            <p className="font-bold">
              {pick.next === userId
                ? 'Your turn to pick!'
                : `${cap(name(pick.next))}’s turn to pick`}
            </p>
            <p className="text-sm text-muted-foreground">
              Last time {name(pick.last.user)} picked {pick.last.label}.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          When you log a visit, open “More details” and choose who picked. Crumbs keeps score.
        </p>
      )}
      {star && (
        <p className="text-sm">
          👏 Best picker: <strong>{cap(name(star[0]))}</strong> ({star[1]} kudos)
        </p>
      )}
      {cook && (
        <div className="flex items-center gap-3">
          <span className="turn-avatar" aria-hidden="true">
            🍳
          </span>
          <div>
            <p className="font-bold">
              {cook.next === userId
                ? 'Your turn to cook!'
                : `${cap(name(cook.next))}’s turn to cook`}
            </p>
            <p className="text-sm text-muted-foreground">
              Last time {name(cook.last.user)} made {cook.last.label}.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
