'use client'
// The single filter bar used on Places and Home: one sideways track with a sliding highlight and
// optional counts (e.g. All · Been · Want to try · Pinned).
import { useLayoutEffect, useRef, useState } from 'react'

export function StatusFilter({
  items,
  value,
  counts,
  onChange,
  label = 'Show',
  display,
}: {
  items: readonly string[]
  value: string
  counts: Record<string, number> | null
  onChange: (value: string) => void
  /** what the bar is called for screen readers */
  label?: string
  /** how an item is written (defaults to the item itself) */
  display?: (item: string) => string
}) {
  const track = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const active = track.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (track.current) observer.observe(track.current)
    return () => observer.disconnect()
  }, [value, counts])
  return (
    <div ref={track} className="status-track" role="tablist" aria-label={label}>
      {thumb && (
        <span
          className="status-thumb"
          aria-hidden="true"
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
        />
      )}
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={value === item}
          className={value === item ? 'status-on' : ''}
          onClick={() => onChange(item)}
        >
          {display ? display(item) : item}
          {counts && <span className="status-count">{counts[item] ?? 0}</span>}
        </button>
      ))}
    </div>
  )
}
