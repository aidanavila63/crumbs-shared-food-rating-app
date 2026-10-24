'use client'
// One small question at a time on places you've been — Crumbs' own "ad slot", spent on keeping
// restaurant info right instead of selling it. Missing details first, then details only Google
// has, then whatever is oldest and due a re-check (hours ~4 months, phone/website ~6, price ~1 year).
// Each person gets a different question order; "Not sure" stops that one for 3 months.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import {
  needsHelp,
  nextQuestion,
  skipQuestion,
  type FactField,
  type Question,
} from '@/lib/restaurants'
import { localUtcOffset, parseHoursText, hoursToText } from '@/lib/hours-text'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { ReadPhotoButton } from './photo-reader'
import { FactEditor, STATUS, thanks } from './restaurant-profile'

const ASKABLE: FactField[] = [
  'hours',
  'price_level',
  'status',
  'website',
  'phone',
  'cuisine',
  'address',
]

export function QuickCheck({
  place,
  store,
  supabase,
  demo,
  onHours,
}: {
  place: Place
  store: RestaurantStore
  supabase: any
  demo: boolean
  onHours: (hours: Hours) => void
}) {
  const r = store.restaurant
  const [q, setQ] = useState<Question | null>(null)
  const [typing, setTyping] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!r || place.status !== 'Been') return
    let cancelled = false
    ;(async () => {
      if (demo) {
        // Demo: same idea on the phone — first thing that's missing or only Google's.
        const field = ASKABLE.find((f) => needsHelp(r).includes(f))
        if (!cancelled) setQ(field ? { field, reason: 'missing', checked_at: null } : null)
        return
      }
      const next = await nextQuestion(supabase, r.id)
      if (!cancelled) setQ(next && ASKABLE.includes(next.field) ? next : null)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, place.status, round])
  if (!r || !q) return null
  const field = q.field

  async function skip(days: number) {
    setQ(null)
    setTyping(false)
    if (!demo && r) await skipQuestion(supabase, r.id, field, days).catch(() => {})
  }
  async function answer(val: unknown, how: 'in_person' | 'photo' = 'in_person') {
    try {
      const result = await store.contribute(field, val, how)
      if (!result) return
      haptic('success')
      track('quick_check', { field, how, reason: q!.reason })
      if (field === 'hours') onHours(val as Hours)
      toast.success(thanks(field, result))
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
    setTyping(false)
    setQ(null)
    // Ask the next one next time the page opens, not straight away.
    if (demo) return
    setTimeout(() => setRound((n) => n + 1), 60_000)
  }

  const current =
    field === 'hours'
      ? hoursToText(r.opening_hours as Hours | null)
      : field === 'price_level'
        ? r.price_level
          ? '$'.repeat(r.price_level)
          : ''
        : field === 'status'
          ? STATUS.find((s) => s.id === r.business_status)?.label
          : String(((r as any)[field === 'address' ? 'formatted_address' : field] ?? '') as string)
  const stale = q.reason === 'stale' && !!current
  const question: Record<string, string> = stale
    ? {
        hours: `Still these hours? ${current}`,
        price_level: `Still about ${current}?`,
        status: 'Still open as usual?',
        website: `Is ${current} still their website?`,
        phone: `Is ${current} still their number?`,
      }
    : {
        hours: `Know ${place.name}’s hours?`,
        price_level: 'How pricey is it?',
        status: 'Still open as usual?',
        website: 'Got their website?',
        phone: 'Got their phone number?',
        cuisine: 'What kind of food is it?',
        address: 'What’s the address?',
      }

  return (
    <div className="quick-check rise-panel" role="group" aria-label="Quick question">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          <span aria-hidden="true">💬 </span>
          {question[field] ?? 'Quick question'}
        </p>
        <button
          className="shrink-0 text-muted-foreground"
          aria-label="Not now"
          onClick={() => skip(7)}
        >
          <X size={16} />
        </button>
      </div>
      {typing ? (
        <FactEditor
          field={field}
          initial={stale ? (field === 'hours' ? r.opening_hours : null) : null}
          utc={(r.opening_hours as Hours | null)?.utc ?? localUtcOffset()}
          onCancel={() => setTyping(false)}
          onSave={(val, how) => answer(val, how === 'photo' ? 'photo' : 'in_person')}
        />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {stale && field !== 'status' && (
            <button
              className="chip chip-sm chip-active"
              onClick={() =>
                answer(
                  field === 'hours'
                    ? r.opening_hours
                    : field === 'price_level'
                      ? r.price_level
                      : (r as any)[field],
                )
              }
            >
              Yes, still right
            </button>
          )}
          {field === 'hours' && (
            <>
              <ReadPhotoButton
                label={stale ? 'They changed — snap the sign' : 'Snap the sign'}
                className="chip chip-sm"
                onText={(read) => {
                  const hours = parseHoursText(read, r.opening_hours?.utc ?? localUtcOffset())
                  if (!hours) return toast('Couldn’t read hours there — try typing them')
                  toast(`Read: ${hoursToText(hours)}`)
                  answer(hours, 'photo')
                }}
              />
              <button className="chip chip-sm" onClick={() => setTyping(true)}>
                {stale ? 'Type the new ones' : 'Type them'}
              </button>
            </>
          )}
          {field === 'price_level' &&
            [1, 2, 3, 4]
              .filter((n) => !stale || n !== r.price_level)
              .map((n) => (
                <button key={n} className="chip chip-sm" onClick={() => answer(n)}>
                  {'$'.repeat(n)}
                </button>
              ))}
          {field === 'status' &&
            STATUS.map((s) => (
              <button key={s.id} className="chip chip-sm" onClick={() => answer(s.id)}>
                {s.label}
              </button>
            ))}
          {['website', 'phone', 'cuisine', 'address'].includes(field) && (
            <button className="chip chip-sm" onClick={() => setTyping(true)}>
              {stale ? 'It changed' : 'Add it'}
            </button>
          )}
          <button className="chip chip-sm" onClick={() => skip(90)}>
            Not sure
          </button>
        </div>
      )}
    </div>
  )
}
