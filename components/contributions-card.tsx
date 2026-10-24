'use client'
// "Building Crumbs": what you've added to the shared restaurant profiles, with badges.
// Every fact and menu dish here is data Crumbs owns — the long-term asset behind the app.
import { useEffect, useState } from 'react'
import { myContributions } from '@/lib/restaurants'

const BADGES = [
  {
    id: 'scout',
    emoji: '🔎',
    title: 'Scout',
    how: 'Add your first restaurant fact',
    test: (c: C) => c.facts >= 1,
  },
  {
    id: 'mapmaker',
    emoji: '🗺️',
    title: 'Map maker',
    how: 'Add 10 facts',
    test: (c: C) => c.facts >= 10,
  },
  {
    id: 'menu',
    emoji: '📜',
    title: 'Menu maker',
    how: 'Add 20 menu dishes',
    test: (c: C) => c.dishes >= 20,
  },
  {
    id: 'checker',
    emoji: '✅',
    title: 'Fact checker',
    how: 'Check 25 menu dishes',
    test: (c: C) => c.checks >= 25,
  },
  {
    id: 'local',
    emoji: '🏙️',
    title: 'Local legend',
    how: 'Help build 10 restaurants',
    test: (c: C) => c.restaurants >= 10,
  },
]
type C = { facts: number; dishes: number; checks: number; restaurants: number }

export function ContributionsCard({
  supabase,
  demo,
  v4,
}: {
  supabase: any
  demo: boolean
  v4: boolean
}) {
  const [c, setC] = useState<C | null>(
    demo ? { facts: 3, dishes: 12, checks: 6, restaurants: 2 } : null,
  )
  useEffect(() => {
    if (demo || !v4) return
    let cancelled = false
    myContributions(supabase).then((data) => !cancelled && data && setC(data))
    return () => {
      cancelled = true
    }
  }, [demo, v4, supabase])
  if (!c) return null
  const earned = BADGES.filter((b) => b.test(c)).length
  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-2xl font-bold">Building Crumbs</h3>
        <span className="text-sm text-muted-foreground">
          {earned}/{BADGES.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Menus, hours and details you add help every group — and make Crumbs’ restaurant info its
        own.
      </p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['facts', 'facts'],
            ['dishes', 'dishes'],
            ['checks', 'checks'],
            ['restaurants', 'places'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="surface-soft !p-2">
            <p className="font-serif text-2xl text-primary">{c[key]}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="badge-grid">
        {BADGES.map((b) => {
          const done = b.test(c)
          return (
            <div
              key={b.id}
              className={`badge ${done ? 'badge-earned' : ''}`}
              aria-label={`${b.title}: ${done ? 'earned' : b.how}`}
            >
              <span className="badge-emoji" aria-hidden="true">
                {b.emoji}
              </span>
              <span className="text-sm font-bold">{b.title}</span>
              <span className="text-xs text-muted-foreground">{b.how}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
