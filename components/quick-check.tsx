'use client'
// One small question at a time on places you've been — Crumbs' own "ad slot", spent on keeping
// restaurant info right instead of selling it. Missing details first, then details only Google
// has, then whatever is oldest and due a re-check (hours ~4 months, phone/website ~6).
// Each person gets a different question order. Always the same three answers: Yes, No, or
// Snap a picture. Price comes from menu prices, so it's never asked; nor is "still open?".
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import {
  needsHelp,
  nextQuestion,
  ownerLocked,
  skipQuestion,
  type Evidence,
  type FactField,
  type Question,
} from '@/lib/restaurants'
import { localUtcOffset, parseHoursText, hoursToText } from '@/lib/hours-text'
import { findPhone, findWebsite } from '@/lib/fact-parse'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { ReadPhotoButton } from './photo-reader'
import { FactEditor, thanks } from './restaurant-profile'

export const ASKABLE: FactField[] = ['hours', 'website', 'phone', 'cuisine', 'address']
const SNAPPABLE: FactField[] = ['hours', 'phone', 'website']

/** Reads the answer off a photo's text, or null. */
export function readFact(field: FactField, text: string, utc: number): unknown {
  if (field === 'hours') return parseHoursText(text, utc)
  if (field === 'phone') return findPhone(text)
  if (field === 'website') return findWebsite(text)
  return null
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The question in words: a yes/no confirmation when Crumbs has its own value, else "Know …?". */
export function questionText(field: FactField, placeName: string, current: string | null) {
  if (current) {
    const confirm: Partial<Record<FactField, string>> = {
      hours: `Still these hours? ${current}`,
      phone: `Is ${current} still their number?`,
      website: `Is ${host(current)} still their website?`,
      cuisine: `Still ${current} food?`,
      address: `Still at ${current}?`,
    }
    return confirm[field] ?? 'Is this still right?'
  }
  const ask: Partial<Record<FactField, string>> = {
    hours: `Know ${placeName}’s hours?`,
    phone: 'Know their phone number?',
    website: 'Know their website?',
    cuisine: 'Know what kind of food it is?',
    address: 'Know the address?',
  }
  return ask[field] ?? 'Quick question'
}

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
  const [typing, setTyping] = useState<null | { initial: unknown; how?: Evidence }>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!r || place.status !== 'Been') return
    let cancelled = false
    ;(async () => {
      if (demo) {
        // Demo: same idea on the phone — first thing that's missing or only Google's.
        const field = ASKABLE.find((f) => needsHelp(r).includes(f) && !ownerLocked(r, f))
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
  if (!r || !q || store.manages) return null
  const field = q.field
  const utc = (r.opening_hours as Hours | null)?.utc ?? localUtcOffset()

  async function skip(days: number) {
    setQ(null)
    setTyping(null)
    if (!demo && r) await skipQuestion(supabase, r.id, field, days).catch(() => {})
  }
  async function answer(val: unknown, how: Evidence = 'in_person') {
    try {
      const result = await store.contribute(field, val, how)
      if (!result) return
      haptic('success')
      track('quick_check', { field, how, reason: q!.reason })
      if (field === 'hours' && !result.locked) onHours(val as Hours)
      toast.success(thanks(field, result))
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
    setTyping(null)
    setQ(null)
    // Ask the next one next time the page opens, not straight away.
    if (demo) return
    setTimeout(() => setRound((n) => n + 1), 60_000)
  }

  // Only Crumbs' own values are shown back (never Google's: members tell us what they see).
  const ownValue =
    q.reason === 'stale'
      ? field === 'hours'
        ? r.opening_hours
        : (r as any)[field === 'address' ? 'formatted_address' : field]
      : null
  const current = ownValue
    ? field === 'hours'
      ? hoursToText(ownValue as Hours) || null
      : String(ownValue)
    : null
  const confirming = !!current

  return (
    <div className="quick-check rise-panel" role="group" aria-label="Quick question">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          <span aria-hidden="true">💬 </span>
          {questionText(field, place.name, current)}
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
          key={JSON.stringify(typing)}
          field={field}
          initial={typing.initial}
          initialHow={typing.how}
          utc={utc}
          onCancel={() => setTyping(null)}
          onSave={(val, how) => answer(val, how)}
        />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className="chip chip-sm chip-active"
            onClick={() => (confirming ? answer(ownValue) : setTyping({ initial: null }))}
          >
            Yes
          </button>
          <button
            className="chip chip-sm"
            // "No" to a confirmation = it changed: say what it is now. "No" to "Know …?" = skip it.
            onClick={() => (confirming ? setTyping({ initial: null }) : skip(90))}
          >
            No
          </button>
          {SNAPPABLE.includes(field) && (
            <ReadPhotoButton
              label="Snap a picture"
              className="chip chip-sm gap-1.5"
              onText={(read) => {
                const found = readFact(field, read, utc)
                if (!found) {
                  toast('Couldn’t read that — type it instead')
                  return setTyping({ initial: null, how: 'photo' })
                }
                setTyping({ initial: found, how: 'photo' })
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
