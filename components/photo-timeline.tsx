'use client'
import { useMemo } from 'react'
import type { Place } from '@/hooks/use-crumbs-data'
import { photoUrl } from '@/lib/photos'
import { allVisits } from '@/lib/stats'

/** A scrapbook of every place and dish photo, newest month first. */
export function PhotoTimeline({ places, onSelect }: { places: Place[]; onSelect?: (place: Place) => void }) {
  const months = useMemo(() => {
    const lastVisit = new Map<string, string>()
    allVisits(places).forEach((visit) => {
      if (visit.visited_on > (lastVisit.get(visit.place.id) ?? '')) lastVisit.set(visit.place.id, visit.visited_on)
    })
    const items = places.flatMap((place) => {
      const date = (id: string, fallback?: string) => (lastVisit.get(id) ?? fallback ?? place.created_at ?? '').slice(0, 10)
      const rows: { key: string; path: string; label: string; date: string; place: Place }[] = []
      if (place.photo_path) rows.push({ key: place.id, path: place.photo_path, label: place.name, date: date(place.id), place })
      place.dishes?.forEach((dish) => {
        if (dish.photo_path)
          rows.push({ key: dish.id, path: dish.photo_path, label: `${dish.name} · ${place.name}`, date: (dish.created_at ?? '').slice(0, 10) || date(place.id), place })
      })
      return rows
    })
    const byMonth = new Map<string, typeof items>()
    items
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((item) => byMonth.set(item.date.slice(0, 7), [...(byMonth.get(item.date.slice(0, 7)) ?? []), item]))
    return [...byMonth.entries()]
  }, [places])
  if (!months.length) return null
  const total = months.reduce((sum, [, items]) => sum + items.length, 0)
  return (
    <details className="surface">
      <summary className="cursor-pointer font-serif text-2xl font-bold">
        Photo timeline <span className="text-base font-normal text-muted-foreground">· {total}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {months.map(([month, items]) => (
          <div key={month}>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              {month
                ? new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                : 'Undated'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <button key={item.key} className="relative aspect-square overflow-hidden rounded-xl bg-muted" aria-label={`Open ${item.label}`} onClick={() => onSelect?.(item.place)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(item.path) ?? undefined} alt={item.label} loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
