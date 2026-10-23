'use client'
import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { StatsPanel } from './stats-panel'
import { PhotoTimeline } from './photo-timeline'
import { placeAverage } from './place-card'

type Idea = { title: string; why: string }

export function ForYouTab({
  places,
  members = [],
  userId,
  names = {},
  onSelect,
}: {
  places: Place[]
  members?: Profile[]
  userId?: string
  names?: Record<string, string>
  onSelect?: (place: Place) => void
}) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [thinking, setThinking] = useState(false)

  const insights = useMemo(() => {
    const rated = places.filter((place) => place.place_ratings.length)
    const favourites = rated
      .filter((place) => placeAverage(place) >= 4)
      .sort((a, b) => placeAverage(b) - placeAverage(a))
      .slice(0, 3)
    const disagreements = rated.filter((place) => {
      const scores = place.place_ratings.map((rating) => rating.score)
      return scores.length > 1 && Math.max(...scores) - Math.min(...scores) >= 2
    })
    const cuisineScores = new Map<string, number[]>()
    rated.forEach((place) => {
      if (place.cuisine) {
        cuisineScores.set(place.cuisine, [
          ...(cuisineScores.get(place.cuisine) ?? []),
          placeAverage(place),
        ])
      }
    })
    const topCuisines = [...cuisineScores.entries()]
      .map(([cuisine, scores]) => ({
        cuisine,
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .filter((item) => item.average >= 3.5)
      .sort((a, b) => b.average - a.average)
      .slice(0, 3)
    const liked = new Set(topCuisines.map((item) => item.cuisine))
    const wishlist = places.filter((place) => place.status === 'Want to try')
    const picks = [
      ...wishlist.filter((place) => place.cuisine && liked.has(place.cuisine)),
      ...wishlist.filter((place) => !(place.cuisine && liked.has(place.cuisine))),
    ].slice(0, 3)
    return { rated, favourites, disagreements, topCuisines, picks, liked }
  }, [places])

  async function getIdeas() {
    setThinking(true)
    try {
      const taste = insights.rated
        .map(
          (place) =>
            `${place.name} (${place.cuisine ?? 'cuisine unknown'}): ${place.place_ratings
              .map((rating) => `${names[rating.user_id] ?? 'Someone'} ${rating.score}/5`)
              .join(', ')}`,
        )
        .join('\n')
        .slice(0, 3900)
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taste }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setIdeas(result.ideas)
    } catch (error: any) {
      toast.error(error?.message || 'Could not get ideas')
    } finally {
      setThinking(false)
    }
  }

  if (!insights.rated.length && !places.length)
    return (
      <div className="empty">
        <Sparkles className="mx-auto text-primary" />
        <h2 className="mt-3 font-serif text-2xl font-bold">Your recommendations are waiting</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Add and rate a few places and Crumbs will learn what you both like.
        </p>
      </div>
    )

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Based on your shared ratings</p>
        <h2 className="font-serif text-3xl font-bold">For you</h2>
      </div>

      {insights.picks.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">Next up from your list</span>
          {insights.picks.map((place) => (
            <button
              key={place.id}
              className="surface-soft text-left"
              onClick={() => onSelect?.(place)}
            >
              <p className="font-semibold">{place.name}</p>
              <p className="text-sm text-muted-foreground">
                {place.cuisine && insights.liked.has(place.cuisine)
                  ? `You both rate ${place.cuisine} highly`
                  : place.formatted_address || 'On your want-to-try list'}
              </p>
            </button>
          ))}
        </div>
      )}

      {insights.favourites.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">Group favourites</span>
          {insights.favourites.map((place) => (
            <button
              key={place.id}
              className="surface-soft flex items-center justify-between text-left"
              onClick={() => onSelect?.(place)}
            >
              <span className="font-semibold">{place.name}</span>
              <span className="font-serif text-xl text-primary">
                {placeAverage(place).toFixed(1)}
              </span>
            </button>
          ))}
        </div>
      )}

      {insights.topCuisines.length > 0 && (
        <div className="surface">
          <span className="tag">Your tastes</span>
          <p className="mt-3 text-sm">
            You lean towards{' '}
            <strong>{insights.topCuisines.map((item) => item.cuisine).join(', ')}</strong>.
          </p>
        </div>
      )}

      {insights.disagreements.length > 0 && (
        <div className="surface">
          <span className="tag">Hot takes</span>
          <p className="mt-3 text-sm">
            You disagree on{' '}
            <strong>{insights.disagreements.map((place) => place.name).join(', ')}</strong>.
          </p>
        </div>
      )}

      <StatsPanel
        places={places}
        members={members}
        userId={userId}
        names={names}
        onSelect={onSelect}
      />

      <PhotoTimeline places={places} onSelect={onSelect} />

      <div className="surface flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="tag">AI ideas</span>
            <p className="mt-2 text-sm text-muted-foreground">
              Cuisines and dishes to try next. These are ideas, not verified restaurants.
            </p>
          </div>
          <button
            className="primary shrink-0"
            disabled={thinking || !insights.rated.length}
            onClick={getIdeas}
          >
            {thinking ? 'Thinking…' : ideas.length ? 'Refresh' : 'Get ideas'}
          </button>
        </div>
        {!insights.rated.length && (
          <p className="text-sm text-muted-foreground">Rate a place first to unlock ideas.</p>
        )}
        {ideas.map((idea) => (
          <div className="surface-soft" key={idea.title}>
            <p className="font-semibold">{idea.title}</p>
            <p className="text-sm text-muted-foreground">{idea.why}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
