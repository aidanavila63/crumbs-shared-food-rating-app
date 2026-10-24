'use client'
import { useState } from 'react'
import type { HomeMeal, Place } from '@/hooks/use-crumbs-data'
import { useSocial, type Activity } from '@/hooks/use-social'
import { milestones, onThisDay } from '@/lib/memories'
import { KINDS, OCCASIONS } from './visits-panel'
import { ReactionBar, timeAgo } from './social'

const ICON: Record<string, string> = {
  place_added: '📍',
  rated: '⭐',
  visited: '🍽️',
  meal_added: '🏠',
  cooked: '🍳',
  joined: '👋',
  planned: '📅',
}

/**
 * #45 Group feed: what everyone's been up to, with reactions and comments (#11).
 * `places` is what you're allowed to see (blind ratings hide scores you haven't earned yet).
 */
export function ActivityFeed({
  places,
  meals,
  names,
  userId,
  onSelect,
}: {
  places: Place[]
  meals: HomeMeal[]
  names: Record<string, string>
  userId?: string
  onSelect: (place: Place) => void
}) {
  const social = useSocial()
  const [limit, setLimit] = useState(12)
  if (!social?.enabled) return null
  const items = social.activity.slice(0, limit)

  function describe(item: Activity) {
    const who = item.actor === userId ? 'You' : (names[item.actor ?? ''] ?? 'Someone')
    const place = places.find((p) => p.id === item.place_id)
    const meal = meals.find((m) => m.id === item.meal_id)
    const placeName = place?.name ?? 'a place'
    switch (item.kind) {
      case 'place_added':
        return `${who} added ${placeName}${item.detail.status === 'Want to try' ? ' to try' : ''}`
      case 'rated': {
        // Blind ratings: only show the score if you can already see ratings for this place.
        const canSee =
          item.actor === userId || !!place?.place_ratings.some((r) => r.user_id === item.actor)
        return canSee && item.detail.score
          ? `${who} rated ${placeName} ${'★'.repeat(item.detail.score)}`
          : `${who} rated ${placeName}${place && item.actor !== userId ? ' (rate it to see)' : ''}`
      }
      case 'visited': {
        const kind = KINDS.find((k) => k.id === item.detail.kind && k.id !== 'dine_in')
        const occasion = OCCASIONS.find((o) => o.id === item.detail.occasion)
        return `${who} logged a visit to ${placeName}${kind ? ` (${kind.label.replace(/^\S+\s/, '')})` : ''}${occasion ? ` · ${occasion.label}` : ''}${item.detail.milestone ? ` · 🏆 ${item.detail.milestone}` : ''}`
      }
      case 'meal_added':
        return `${who} added ${meal?.name ?? 'a home meal'}${item.detail.status === 'Want to cook' ? ' to cook' : ''}`
      case 'cooked':
        return `${who} cooked ${meal?.name ?? 'something'} at home`
      case 'joined':
        return `${who} joined the group`
      case 'planned':
        return `${who} planned ${item.detail.title ?? 'a dinner'}`
      default:
        return `${who} did something`
    }
  }

  return (
    <div className="surface flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">What’s new</h3>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Adds, ratings, visits and home cooking show up here.
        </p>
      )}
      {items.map((item) => {
        const place = places.find((p) => p.id === item.place_id)
        return (
          <div key={item.id} className="feed-item flex gap-3">
            <span className="feed-icon" aria-hidden="true">
              {ICON[item.kind] ?? '•'}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {place ? (
                <button className="text-left text-sm font-semibold" onClick={() => onSelect(place)}>
                  {describe(item)}
                </button>
              ) : (
                <p className="text-sm font-semibold">{describe(item)}</p>
              )}
              <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
              <ReactionBar target={`activity:${item.id}`} names={names} />
            </div>
          </div>
        )
      })}
      {social.activity.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + 20)}>
          Show more
        </button>
      )}
    </div>
  )
}

/** #69 On this day + #70 milestones. Hidden when there's nothing to show. */
export function MemoriesCard({
  places,
  meals,
  onSelect,
}: {
  places: Place[]
  meals: HomeMeal[]
  onSelect: (place: Place) => void
}) {
  const today = onThisDay(places, meals)
  const marks = milestones(places).slice(0, 6)
  if (!today.length && !marks.length) return null
  return (
    <div className="surface memories-card flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">Memories</h3>
      {today.map((memory) => {
        const place = places.find((p) => p.id === memory.placeId)
        return (
          <button
            key={memory.key}
            className="surface-soft text-left"
            disabled={!place}
            onClick={() => place && onSelect(place)}
          >
            <span className="tag mb-1">
              {memory.yearsAgo === 1 ? 'A year ago' : `${memory.yearsAgo} years ago`}
              {memory.on.slice(5) !== new Date().toISOString().slice(5, 10)
                ? ' this week'
                : ' today'}
            </span>
            <p className="font-semibold">{memory.text}</p>
          </button>
        )
      })}
      {marks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Milestones
          </p>
          {marks.map(({ place, visit }) => (
            <button
              key={visit.id}
              className="flex items-center gap-3 text-left"
              onClick={() => onSelect(place)}
            >
              <span className="feed-icon" aria-hidden="true">
                {visit.milestone ? '🏆' : visit.occasion === 'date' ? '💕' : '🎉'}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">
                  {visit.milestone ||
                    OCCASIONS.find((o) => o.id === visit.occasion)?.label.replace(/^\S+\s/, '')}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {place.name} ·{' '}
                  {new Date(`${visit.visited_on}T12:00:00`).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
