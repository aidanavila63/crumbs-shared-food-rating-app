'use client'
// "Building Crumbs": your contributor tier, points and badges. Only NEW restaurant info earns
// (small) points; they count for 6 months, so tiers have to be kept up. Higher tiers get somewhat
// bigger daily allowances (AI ideas, Explore, menu imports) — and later, perks with paid plans.
import { useEffect, useState } from 'react'
import { myContributions } from '@/lib/restaurants'
import { POINTS, TIERS, nextTier, pointsFor, tierFor } from '@/lib/tiers'

type C = {
  facts: number
  dishes: number
  checks: number
  restaurants: number
  verified?: number
  points?: number
  today?: number
  daily_cap?: number
  expiring?: number
  window_days?: number
  allowances?: Record<string, number>
}

const BADGES = [
  {
    id: 'scout',
    emoji: '🔎',
    title: 'Scout',
    how: 'Add your first restaurant detail',
    test: (c: C) => c.facts >= 1,
  },
  {
    id: 'mapmaker',
    emoji: '🗺️',
    title: 'Map maker',
    how: 'Add 10 details',
    test: (c: C) => c.facts >= 10,
  },
  {
    id: 'menu',
    emoji: '📜',
    title: 'Menu maker',
    how: 'Add 20 menu dishes (photos or receipts)',
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
    id: 'trusted',
    emoji: '🤝',
    title: 'Trusted',
    how: 'Have 5 of your details backed up by others',
    test: (c: C) => (c.verified ?? 0) >= 5,
  },
  {
    id: 'local',
    emoji: '🏙️',
    title: 'Local legend',
    how: 'Help build 10 restaurants',
    test: (c: C) => c.restaurants >= 10,
  },
]

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
    demo
      ? { facts: 9, dishes: 12, checks: 6, restaurants: 4, verified: 3, points: 31, expiring: 4 }
      : null,
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
  const points = c.points ?? pointsFor(c)
  const tier = tierFor(points)
  const next = nextTier(points)
  const earned = BADGES.filter((b) => b.test(c)).length
  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="tier-badge" aria-hidden="true">
          {tier.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Building Crumbs
          </p>
          <p className="font-serif text-2xl font-bold">{tier.name}</p>
          <p className="text-sm text-muted-foreground">
            {points} points
            {next.next ? ` · ${next.need} to ${next.next.name}` : ' · top tier'}
          </p>
        </div>
      </div>
      {next.next && (
        <span className="owned-bar" aria-label={`${next.pct}% of the way to ${next.next.name}`}>
          <span className="bar-fill" style={{ width: `${Math.max(3, next.pct)}%` }} />
        </span>
      )}
      <p className="text-sm">
        <strong>Your perks:</strong> {tier.perk} — {c.allowances?.ai ?? tier.limits.ai} AI ideas,{' '}
        {c.allowances?.explore ?? tier.limits.explore} Explore searches and{' '}
        {c.allowances?.menu_import ?? tier.limits.menuImport} menu imports a day.
      </p>
      {!!c.expiring && (
        <p className="text-sm font-semibold text-primary">
          {c.expiring} point{c.expiring === 1 ? '' : 's'} stop counting this month — keep your tier
          by adding something new.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Points are for <strong>new</strong> info only: a missing detail or one that’s due a re-check
        ({POINTS.detail}), when others back you up (+{POINTS.backed}), a menu photo with new dishes
        ({POINTS.menuPhoto}). Logging visits, receipts and ticking dishes still help but don’t earn
        points. Up to {c.daily_cap ?? POINTS.dailyCap} a day
        {c.today !== undefined ? ` (${c.today} today)` : ''}; points count for{' '}
        {Math.round((c.window_days ?? POINTS.windowDays) / 30)} months.
      </p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['facts', 'details'],
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
      <details className="tier-ladder">
        <summary className="cursor-pointer text-sm font-semibold text-primary">All tiers</summary>
        <div className="mt-2 flex flex-col gap-1">
          {TIERS.map((t) => (
            <p
              key={t.level}
              className={`text-sm ${t.level === tier.level ? 'font-bold' : 'text-muted-foreground'}`}
            >
              {t.emoji} {t.name} · {t.min}+ points in 6 months · {t.perk}
            </p>
          ))}
        </div>
      </details>
      <p className="text-sm font-semibold">
        Badges {earned}/{BADGES.length}
      </p>
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
