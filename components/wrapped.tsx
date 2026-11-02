'use client'
// #61 Crumbs Wrapped: your group's year in food as tap-through story cards (tap right = next,
// tap left = back, arrows on a keyboard), ending with a summary card you can share or save as
// an image. Built on the phone from your own data — free, nothing sent anywhere.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Group, HomeMeal, Place, Profile } from '@/hooks/use-crumbs-data'
import { buildWrapped, defaultWrappedYear, wrappedYears, type Wrapped } from '@/lib/wrapped'
import { haptic, useCountUp } from '@/lib/motion'
import { track } from '@/lib/analytics'

type Slide = {
  key: string
  emoji: string
  kicker: string
  big?: number
  bigText?: string
  unit?: string
  line?: string
  sub?: string
  /** #218 year map */
  dots?: { x: number; y: number; n: number }[]
}

export function wrappedSlides(w: Wrapped, groupName: string): Slide[] {
  const s: Slide[] = [
    {
      key: 'intro',
      emoji: '🍽️',
      kicker: `${groupName} on Crumbs`,
      bigText: String(w.year),
      line: 'Your year in food',
      sub: 'Tap to start',
    },
  ]
  if (w.visits)
    s.push({
      key: 'visits',
      emoji: '📍',
      kicker: 'You ate out',
      big: w.visits,
      unit: w.visits === 1 ? 'time' : 'times',
      line: `at ${w.places} place${w.places === 1 ? '' : 's'}`,
      sub: w.newPlaces ? `${w.newPlaces} of them brand new to you` : undefined,
    })
  if (w.busiestMonth && w.busiestMonth.visits > 1)
    s.push({
      key: 'month',
      emoji: '📅',
      kicker: 'Your busiest month',
      bigText: w.busiestMonth.month,
      line: `${w.busiestMonth.visits} meals out`,
    })
  if (w.streak >= 2)
    s.push({
      key: 'streak',
      emoji: '🔥',
      kicker: 'Longest streak',
      big: w.streak,
      unit: 'weeks',
      line: 'in a row with a meal out',
    })
  if (w.cuisines)
    s.push({
      key: 'cuisines',
      emoji: '🌍',
      kicker: 'You tried',
      big: w.cuisines,
      unit: w.cuisines === 1 ? 'cuisine' : 'cuisines',
      line: w.topCuisine ? `Mostly ${w.topCuisine.name} — ${w.topCuisine.visits} times` : undefined,
    })
  if (w.regular)
    s.push({
      key: 'regular',
      emoji: '🔁',
      kicker: 'Your regular',
      bigText: w.regular.place.name,
      line: `${w.regular.visits} visits this year`,
    })
  if (w.favourite)
    s.push({
      key: 'fave',
      emoji: '🏆',
      kicker: 'Favourite of the year',
      bigText: w.favourite.place.name,
      line: `★ ${w.favourite.score.toFixed(1)} from your group`,
    })
  if (w.bestDish)
    s.push({
      key: 'dish',
      emoji: '🥢',
      kicker: 'Dish of the year',
      bigText: w.bestDish.name,
      line: `at ${w.bestDish.place} · ${w.bestDish.points}/100`,
      sub: w.dishesRated > 1 ? `out of ${w.dishesRated} dishes you rated` : undefined,
    })
  if (w.spend)
    s.push({
      key: 'spend',
      emoji: '💸',
      kicker: 'Spent on eating out',
      big: w.spend,
      unit: '$',
      line: w.perHead ? `about $${w.perHead} a person` : undefined,
      sub: w.priciestMonth ? `Splurge month: ${w.priciestMonth.month}` : undefined,
    })
  if (w.homeCooked)
    s.push({
      key: 'home',
      emoji: '🍳',
      kicker: 'Cooked at home',
      big: w.homeCooked,
      unit: w.homeCooked === 1 ? 'meal' : 'meals',
      line: w.topMeal ? `${w.topMeal.name} ${w.topMeal.times} times` : undefined,
    })
  if (w.dates || w.takeout)
    s.push({
      key: 'nights',
      emoji: w.dates ? '💞' : '🥡',
      kicker: w.dates ? 'Date nights' : 'Takeout nights',
      big: w.dates || w.takeout,
      line:
        w.dates && w.takeout
          ? `and ${w.takeout} takeout night${w.takeout === 1 ? '' : 's'}`
          : undefined,
    })
  if (w.dots.length >= 3)
    s.push({
      key: 'map',
      emoji: '🗺️',
      kicker: 'Your year on the map',
      dots: w.dots,
      line: `${w.places} places, every dot a meal out`,
    })
  if (
    w.evolution &&
    (w.evolution.newCuisines.length ||
      w.evolution.ratingChange ||
      w.evolution.lastTop !== w.evolution.thisTop)
  )
    s.push({
      key: 'evolution',
      emoji: '🌱',
      kicker: `Since ${w.year - 1}`,
      bigText: w.evolution.newCuisines.length
        ? `New: ${w.evolution.newCuisines.join(', ')}`
        : w.evolution.thisTop && w.evolution.lastTop !== w.evolution.thisTop
          ? `${w.evolution.lastTop ?? '—'} → ${w.evolution.thisTop}`
          : 'Same tastes, new spots',
      line:
        w.evolution.lastTop && w.evolution.thisTop && w.evolution.lastTop !== w.evolution.thisTop
          ? `Your go-to went from ${w.evolution.lastTop} to ${w.evolution.thisTop}`
          : w.evolution.newCuisines.length
            ? 'Cuisines you tried for the first time'
            : undefined,
      sub:
        w.evolution.ratingChange && Math.abs(w.evolution.ratingChange) >= 0.2
          ? `You rated ${w.evolution.ratingChange > 0 ? 'higher' : 'tougher'} this year (${w.evolution.ratingChange > 0 ? '+' : ''}${w.evolution.ratingChange}★)`
          : undefined,
    })
  if (w.you)
    s.push({
      key: 'you',
      emoji: '⭐',
      kicker: 'You rated',
      big: w.you.rated,
      unit: w.you.rated === 1 ? 'place' : 'places',
      line: `your average ★ ${w.you.average.toFixed(1)}`,
      sub: w.match ? `Taste match with ${w.match.name}: ${w.match.percent}%` : undefined,
    })
  return s
}

function BigNumber({ value, unit }: { value: number; unit?: string }) {
  const shown = useCountUp(value, 1100)
  return (
    <p className="wrap-big">
      {unit === '$' ? '$' : ''}
      {shown.toLocaleString()}
      {unit && unit !== '$' ? <span className="wrap-unit"> {unit}</span> : null}
    </p>
  )
}

/** The summary as a 1080×1920 picture (for stories / saving). */
async function summaryImage(w: Wrapped, groupName: string) {
  const c = document.createElement('canvas')
  c.width = 1080
  c.height = 1920
  const g = c.getContext('2d')!
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#7b2d5b'
  const bg = g.createLinearGradient(0, 0, 1080, 1920)
  bg.addColorStop(0, accent)
  bg.addColorStop(1, '#1d1a24')
  g.fillStyle = bg
  g.fillRect(0, 0, 1080, 1920)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.font = '600 52px Georgia, serif'
  g.fillText(`${groupName} · Crumbs`, 540, 220)
  g.font = '700 220px Georgia, serif'
  g.fillText(String(w.year), 540, 460)
  g.font = '500 54px Georgia, serif'
  g.fillText('Our year in food', 540, 560)
  const rows = [
    ['Meals out', String(w.visits)],
    ['Places', `${w.places}${w.newPlaces ? ` (${w.newPlaces} new)` : ''}`],
    ['Cuisines', String(w.cuisines)],
    ...(w.favourite ? ([['Favourite', w.favourite.place.name]] as [string, string][]) : []),
    ...(w.bestDish ? ([['Dish of the year', w.bestDish.name]] as [string, string][]) : []),
    ...(w.regular ? ([['Our regular', w.regular.place.name]] as [string, string][]) : []),
    ...(w.streak >= 2 ? ([['Longest streak', `${w.streak} weeks`]] as [string, string][]) : []),
    ...(w.homeCooked ? ([['Cooked at home', String(w.homeCooked)]] as [string, string][]) : []),
  ].slice(0, 8) as [string, string][]
  rows.forEach(([label, value], i) => {
    const y = 760 + i * 135
    g.fillStyle = 'rgba(255,255,255,0.14)'
    g.beginPath()
    g.roundRect(120, y - 80, 840, 112, 36)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.75)'
    g.textAlign = 'left'
    g.font = '500 38px system-ui, sans-serif'
    g.fillText(label, 165, y - 8)
    g.fillStyle = '#fff'
    g.textAlign = 'right'
    g.font = '700 44px system-ui, sans-serif'
    const text = value.length > 22 ? `${value.slice(0, 21)}…` : value
    g.fillText(text, 915, y - 8)
  })
  g.textAlign = 'center'
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.font = '500 36px system-ui, sans-serif'
  g.fillText('made with Crumbs', 540, 1840)
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'),
  )
}

export function WrappedStory({
  places,
  meals,
  group,
  members,
  userId,
  season,
}: {
  places: Place[]
  meals: HomeMeal[]
  group: Group
  members: Profile[]
  userId?: string
  /** which Wrapped is open right now (full year, or January–June) */
  season?: { year: number; half: boolean }
}) {
  const allYears = useMemo(() => wrappedYears(places), [places])
  const years = season?.half ? [season.year] : allYears
  const [year, setYear] = useState(() => season?.year ?? defaultWrappedYear(places))
  const half = !!season?.half && year === season.year
  const wrapped = useMemo(
    () => buildWrapped({ places, year, userId, members, meals, half }),
    [places, year, userId, members, meals, half],
  )
  const slides = useMemo(
    () => (wrapped ? wrappedSlides(wrapped, group.name) : []),
    [wrapped, group.name],
  )
  const [at, setAt] = useState(0)
  const total = slides.length + 1 // + summary
  const tracked = useRef(false)
  useEffect(() => {
    if (!tracked.current && wrapped) {
      tracked.current = true
      track('wrapped_open', { year })
    }
  }, [wrapped, year])

  const go = (delta: number) => {
    haptic('tap')
    setAt((n) => Math.max(0, Math.min(total - 1, n + delta)))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function share() {
    if (!wrapped) return
    try {
      const blob = await summaryImage(wrapped, group.name)
      const file = new File([blob], `crumbs-wrapped-${wrapped.year}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Our ${wrapped.year} in food` })
        track('wrapped_share', { year })
      } else download(blob)
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('Couldn’t make the picture')
    }
  }
  function download(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crumbs-wrapped-${year}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  if (!wrapped)
    return (
      <div className="wrap-stage wrap-tone-0">
        <div className="wrap-card">
          <p className="wrap-emoji">🍽️</p>
          <p className="wrap-kicker">Crumbs Wrapped</p>
          <p className="wrap-line">
            Log a few visits this year and your Wrapped will build itself.
          </p>
        </div>
      </div>
    )

  const slide = slides[at]
  return (
    <div className={`wrap-stage wrap-tone-${at % 6}`}>
      <div className="wrap-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i <= at ? 'wrap-progress-on' : ''} />
        ))}
      </div>
      {at === 0 && years.length > 1 && (
        <div className="wrap-years" role="radiogroup" aria-label="Year">
          {years.slice(0, 4).map((y) => (
            <button
              key={y}
              role="radio"
              aria-checked={y === year}
              className={`chip chip-sm ${y === year ? 'chip-active' : ''}`}
              onClick={() => {
                setYear(y)
                setAt(0)
              }}
            >
              {y}
            </button>
          ))}
        </div>
      )}
      {slide ? (
        <>
          <button className="wrap-tap wrap-tap-back" aria-label="Back" onClick={() => go(-1)} />
          <button className="wrap-tap wrap-tap-next" aria-label="Next" onClick={() => go(1)} />
          <div key={`${year}-${slide.key}`} className="wrap-card" aria-live="polite">
            <p className="wrap-emoji">{slide.emoji}</p>
            <p className="wrap-kicker">{slide.kicker}</p>
            {slide.dots ? (
              <svg
                viewBox="0 0 100 100"
                className="wrap-map"
                role="img"
                aria-label="Your year on the map"
              >
                {slide.dots.map((d, i) => (
                  <circle
                    key={i}
                    cx={d.x * 100}
                    cy={d.y * 100}
                    r={Math.min(6, 1.6 + d.n * 0.8)}
                    className="wrap-dot"
                    style={{ animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </svg>
            ) : slide.big !== undefined ? (
              <BigNumber value={slide.big} unit={slide.unit} />
            ) : (
              <p className="wrap-big wrap-big-text">{slide.bigText}</p>
            )}
            {slide.line && <p className="wrap-line">{slide.line}</p>}
            {slide.sub && <p className="wrap-sub">{slide.sub}</p>}
          </div>
        </>
      ) : (
        <div key={`${year}-summary`} className="wrap-card wrap-summary">
          <button className="wrap-back-link" onClick={() => go(-1)}>
            ‹ Back
          </button>
          <p className="wrap-kicker">
            {group.name} · {wrapped.year}
          </p>
          <div className="wrap-grid">
            {(
              [
                ['Meals out', wrapped.visits],
                ['Places', wrapped.places],
                ['New to you', wrapped.newPlaces],
                ['Cuisines', wrapped.cuisines],
                ['Streak', wrapped.streak ? `${wrapped.streak} wk` : '—'],
                ['Home cooked', wrapped.homeCooked],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="wrap-stat">
                <p className="wrap-stat-value">{value}</p>
                <p className="wrap-stat-label">{label}</p>
              </div>
            ))}
          </div>
          {wrapped.favourite && <p className="wrap-line">🏆 {wrapped.favourite.place.name}</p>}
          {wrapped.bestDish && (
            <p className="wrap-sub">
              🥢 {wrapped.bestDish.name} at {wrapped.bestDish.place}
            </p>
          )}
          <div className="wrap-actions">
            <button className="primary" onClick={share}>
              <Share2 size={18} /> Share
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  download(await summaryImage(wrapped, group.name))
                } catch {
                  toast.error('Couldn’t make the picture')
                }
              }}
            >
              <Download size={18} /> Save image
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
