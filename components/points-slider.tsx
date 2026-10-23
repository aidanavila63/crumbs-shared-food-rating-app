'use client'
import { useEffect, useRef, useState } from 'react'

/** 0-100 score slider. Saves once when you let go, not on every tick. */
export function PointsSlider({
  value,
  label,
  onCommit,
}: {
  value: number | null
  label: string
  onCommit: (points: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(value)
  const committed = useRef<number | null>(value)
  useEffect(() => {
    setDraft(value)
    committed.current = value
  }, [value])
  function commit() {
    if (draft === null || draft === committed.current) return
    committed.current = draft
    onCommit(draft)
  }
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={`${label}: score out of 100`}
        className={`points-slider flex-1 ${draft === null ? 'opacity-50' : ''}`}
        value={draft ?? 50}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="w-16 text-right font-serif text-xl font-bold text-primary">
        {draft === null ? '—' : draft}
        <span className="text-xs font-normal text-muted-foreground">/100</span>
      </span>
    </div>
  )
}
