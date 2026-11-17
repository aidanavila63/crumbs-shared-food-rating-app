'use client'
// Round 83 (D3/D4/D5): underline tabs — plain words with a line under the one you're on.
import { useLayoutEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/motion'

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, tabs.length])
  return (
    <div ref={row} className={`utabs ${className}`} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={value === t.id ? 'utab utab-on' : 'utab'}
          onClick={() => {
            if (t.id === value) return
            haptic('tap')
            onChange(t.id)
          }}
        >
          {t.label}
          {t.count !== undefined && <span className="utab-count">{t.count}</span>}
        </button>
      ))}
      {bar && (
        <span
          className="utab-bar"
          style={{ transform: `translateX(${bar.left}px)`, width: bar.width }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
