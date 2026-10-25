'use client'
// #186 Decide in 60 seconds: three options (a favourite, something new, a wildcard), a timer, tap
// one and you're done. If the time runs out, Crumbs picks the first.
import { useEffect, useMemo, useState } from 'react'
import type { Place } from '@/hooks/use-crumbs-data'
import { threeOptions } from '@/lib/decide-more'
import { haptic } from '@/lib/motion'
import { Overlay } from './overlay'
import { useShowScore } from './score-input'
import { average5 } from '@/lib/ratings'

const SECONDS = 60

export function QuickDecide({
  places,
  onPick,
  onPlan,
  onClose,
}: {
  places: Place[]
  onPick: (place: Place) => void
  /** make it tonight's plan (when plans are on) */
  onPlan?: (place: Place) => void
  onClose: () => void
}) {
  const show = useShowScore()
  const [round, setRound] = useState(0)
  // a new set of three each round (Shuffle)
  const options = useMemo(() => threeOptions(places), [places, round]) // eslint-disable-line react-hooks/exhaustive-deps
  const [left, setLeft] = useState(SECONDS)
  const [chosen, setChosen] = useState<Place | null>(null)

  useEffect(() => {
    if (chosen) return
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(timer)
  }, [chosen, round])
  useEffect(() => {
    if (left === 0 && !chosen && options[0]) {
      haptic('success')
      setChosen(options[0])
    }
  }, [left, chosen, options])

  const labels = ['A favourite', 'Something new', 'Wildcard']
  return (
    <Overlay label="Decide in 60 seconds" title="Decide in 60 seconds" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!chosen ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tap one. No overthinking.</span>
              <strong className={left <= 10 ? 'text-destructive' : ''}>{left}s</strong>
            </div>
            <span className="owned-bar" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${(left / SECONDS) * 100}%` }} />
            </span>
            {options.length ? (
              options.map((place, i) => (
                <button
                  key={place.id}
                  className="surface quick-option flex items-center justify-between gap-3 text-left"
                  onClick={() => {
                    haptic('success')
                    setChosen(place)
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-muted-foreground uppercase">
                      {labels[i] ?? 'Option'}
                    </span>
                    <span className="block font-serif text-2xl font-bold">{place.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[place.cuisine, place.price_level ? '$'.repeat(place.price_level) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {average5(place.place_ratings) > 0 && (
                    <span className="font-serif text-2xl text-primary">
                      {show(average5(place.place_ratings))}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Add a few places first.</p>
            )}
            <button
              className="secondary"
              onClick={() => {
                setRound((r) => r + 1)
                setLeft(SECONDS)
              }}
            >
              Shuffle (restarts the clock)
            </button>
          </>
        ) : (
          <div className="surface dice-reveal flex flex-col items-center gap-3 text-center">
            <p className="text-5xl" aria-hidden="true">
              🎉
            </p>
            <p className="text-sm text-muted-foreground">Decided:</p>
            <p className="font-serif text-3xl font-bold">{chosen.name}</p>
            <div className="flex w-full gap-2">
              {onPlan && (
                <button className="primary flex-1" onClick={() => onPlan(chosen)}>
                  Make it tonight’s plan
                </button>
              )}
              <button
                className={onPlan ? 'secondary flex-1' : 'primary flex-1'}
                onClick={() => onPick(chosen)}
              >
                Open it
              </button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  )
}
