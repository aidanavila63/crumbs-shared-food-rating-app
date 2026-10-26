'use client'
import { useEffect, useRef, useState } from 'react'

/** 0-100 score slider. Saves once when you let go, not on every tick. After saving it rests for a
 *  moment ("Saved ✓") so a second touch can't change it by accident. */
export function PointsSlider({
  value,
  label,
  onCommit,
  onClear,
}: {
  value: number | null
  label: string
  onCommit: (points: number) => void
  /** Shown as "Clear" when you've scored it. */
  onClear?: () => void
}) {
  const [draft, setDraft] = useState<number | null>(value)
  const [resting, setResting] = useState(false)
  const committed = useRef<number | null>(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setDraft(value)
    committed.current = value
  }, [value])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  function commit() {
    if (resting || draft === null || draft === committed.current) return
    committed.current = draft
    onCommit(draft)
    setResting(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setResting(false), 1500)
  }
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={`${label}: score out of 100`}
        className={`points-slider flex-1 ${draft === null ? 'opacity-50' : ''} ${resting ? 'pointer-events-none' : ''}`}
        disabled={resting}
        value={draft ?? 50}
        onChange={(event) => !resting && setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="w-16 text-right font-serif text-xl font-bold text-primary">
        {resting ? (
          <span className="text-sm font-bold text-[var(--success,#2f6b4a)]">Saved ✓</span>
        ) : (
          <>
            {draft === null ? '—' : draft}
            <span className="text-xs font-normal text-muted-foreground">/100</span>
          </>
        )}
      </span>
      {onClear && !resting && (
        <button
          type="button"
          className="text-xs font-semibold text-muted-foreground underline"
          aria-label={`Clear your score for ${label}`}
          onClick={() => {
            if (window.confirm(`Take your score off ${label}?`)) onClear()
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
