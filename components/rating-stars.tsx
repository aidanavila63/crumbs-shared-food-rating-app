'use client'
import { useState } from 'react'
import { Star } from 'lucide-react'
import { haptic } from '@/lib/motion'

/** Stars. Tapping one pops it; tapping 5 adds a little sparkle burst. */
export function RatingStars({
  value,
  onChange,
  label = 'rating',
}: {
  value: number
  onChange?: (value: number) => void
  label?: string
}) {
  // Bumped on every tap so the pop/burst animation replays even for the same star.
  const [tapped, setTapped] = useState<{ n: number; key: number } | null>(null)
  // Display-only stars are plain spans (they often sit inside a clickable card, and a
  // button inside a button is invalid HTML).
  if (!onChange)
    return (
      <span
        className="inline-flex items-center text-[#D9931C]"
        role="img"
        aria-label={`${label}: ${value} of 5 stars`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="inline-grid min-w-8 place-items-center">
            <Star size={18} fill={n <= value ? 'currentColor' : 'none'} />
          </span>
        ))}
      </span>
    )
  return (
    <span className="inline-flex items-center text-[#D9931C]">
      {[1, 2, 3, 4, 5].map((n) => {
        const popping = tapped?.n === n
        return (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} stars`}
            className="star-btn relative min-h-11 min-w-8 transition-transform active:scale-90"
            onClick={() => {
              haptic(n === 5 ? 'celebrate' : 'select')
              setTapped({ n, key: Date.now() })
              onChange(n)
            }}
          >
            <span
              key={popping ? tapped.key : 'still'}
              className={`inline-block ${popping ? 'star-pop' : ''}`}
            >
              <Star size={18} fill={n <= value ? 'currentColor' : 'none'} />
            </span>
            {popping && n === 5 && (
              <span key={`burst-${tapped.key}`} className="star-burst" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <i key={i} style={{ '--a': `${i * 60}deg` } as React.CSSProperties} />
                ))}
              </span>
            )}
          </button>
        )
      })}
    </span>
  )
}
