'use client'
import { createContext, useContext, useState } from 'react'
import { Star } from 'lucide-react'
import { haptic } from '@/lib/motion'
import { formatScore, inputValue, ratingPoints, type Scale } from '@/lib/ratings'
import type { Rating } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'

/** A star that can be empty, half or full. */
function PartStar({ fill, size = 18 }: { fill: 0 | 0.5 | 1; size?: number }) {
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <Star size={size} fill="none" className="absolute inset-0" />
      {fill > 0 && (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: fill === 1 ? '100%' : '50%' }}
        >
          <Star size={size} fill="currentColor" />
        </span>
      )}
    </span>
  )
}

/**
 * #2 Rating input in the group's scale: whole stars, half stars (tap the left or right half of a
 * star) or 1-10 points. `value` is what the scale shows (e.g. 3.5 or 7).
 */
export function ScoreInput({
  value,
  scale,
  onChange,
  label = 'Your rating',
}: {
  value: number
  scale: Scale
  onChange: (value: number) => void
  label?: string
}) {
  const [popped, setPopped] = useState<number | null>(null)
  if (scale === '5') return <RatingStars value={value} onChange={onChange} label={label} />
  if (scale === 'half')
    return (
      <span className="inline-flex items-center text-[#D9931C]" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="relative inline-grid min-h-11 min-w-8 place-items-center">
            <span
              key={popped === n ? `p${value}` : 's'}
              className={popped === n ? 'star-pop inline-block' : 'inline-block'}
            >
              <PartStar fill={value >= n ? 1 : value >= n - 0.5 ? 0.5 : 0} size={20} />
            </span>
            {[n - 0.5, n].map((v, half) => (
              <button
                key={v}
                type="button"
                aria-label={`${label}: ${v} stars`}
                className="absolute inset-y-0 w-1/2"
                style={{ left: half ? '50%' : 0 }}
                onClick={() => {
                  haptic(v === 5 ? 'celebrate' : 'select')
                  setPopped(n)
                  onChange(v)
                }}
              />
            ))}
          </span>
        ))}
      </span>
    )
  return (
    <span className="points-row" role="group" aria-label={`${label} out of 10`}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${label}: ${n} out of 10`}
          aria-pressed={value === n}
          className={`${n <= value ? 'points-on' : ''} ${value === n ? 'points-current' : ''}`}
          onClick={() => {
            haptic(n === 10 ? 'celebrate' : 'select')
            onChange(n)
          }}
        >
          {n}
        </button>
      ))}
    </span>
  )
}

/** Read-only rating in the group's scale. */
export function ScoreDisplay({
  rating,
  scale,
  label = 'rating',
}: {
  rating: Pick<Rating, 'score' | 'points'>
  scale: Scale
  label?: string
}) {
  if (scale === '5') return <RatingStars value={rating.score} label={label} />
  if (scale === '10')
    return (
      <span
        className="font-serif text-lg font-bold text-primary"
        aria-label={`${label}: ${inputValue(rating, '10')} out of 10`}
      >
        {inputValue(rating, '10')}/10
      </span>
    )
  const v = Math.round(ratingPoints(rating) / 10) / 2
  return (
    <span
      className="inline-flex text-[#D9931C]"
      role="img"
      aria-label={`${label}: ${v} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="inline-grid min-w-6 place-items-center">
          <PartStar fill={v >= n ? 1 : v >= n - 0.5 ? 0.5 : 0} />
        </span>
      ))}
    </span>
  )
}

/** The group's rating scale, provided once at the top of the app. */
export const ScaleContext = createContext<Scale>('5')
/** Formats a 0-5 average in the group's scale ("4.5" or "9.0"). */
export function useShowScore() {
  const scale = useContext(ScaleContext)
  return (avg5: number) => formatScore(avg5, scale)
}
