'use client'
// One small question at a time on places you've been — Crumbs' own "ad slot", spent on keeping
// restaurant info right instead of selling it. It asks about everything Crumbs can't call its
// own yet (picked by the database, see next_question): missing details, details only Google has
// (can't be kept), details one member gave (need a cross-check), open data (fine, but better to
// own), then our own details when a re-check is due. Each person gets a different order.
// Always the same three answers: Yes, No, or Snap a picture. Price comes from menu prices, so it's
// never asked; nor is "still open?". The map pin is only asked when you're standing there.
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
  type Restaurant,
} from '@/lib/restaurants'
import { localUtcOffset, parseHoursText, hoursToText } from '@/lib/hours-text'
import { findPhone, findWebsite } from '@/lib/fact-parse'
import { hereNow, nearEnough, type Here } from '@/lib/here'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { ReadPhotoButton } from './photo-reader'
import { FactEditor, thanks } from './restaurant-profile'

export const ASKABLE: FactField[] = [
  'hours',
  'website',
  'phone',
  'cuisine',
  'address',
  'name',
  'location',
]
const SNAPPABLE: FactField[] = ['hours', 'phone', 'website']
/** Reasons where the value is Crumbs' own or open data, so it can be shown back to confirm. */
const SHOW_VALUE: Question['reason'][] = ['unclaimed', 'open_data', 'stale']

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

function valueOf(r: Restaurant, field: FactField): unknown {
  if (field === 'hours') return r.opening_hours
  if (field === 'address') return r.formatted_address
  if (field === 'location')
    return r.latitude === null ? null : { lat: r.latitude, lng: r.longitude }
  return (r as any)[field] ?? null
}

/** The question in words: a yes/no confirmation when there's a value we can show, else "Know …?". */
export function questionText(field: FactField, placeName: string, current: string | null) {
  if (field === 'location') return `Are you at ${placeName} right now?`
  if (current) {
    const confirm: Partial<Record<FactField, string>> = {
      hours: `Still these hours? ${current}`,
      phone: `Is ${current} still their number?`,
      website: `Is ${host(current)} still their website?`,
      cuisine: `Is it ${current} food?`,
      address: `Is it at ${current}?`,
      name: `Is it called “${current}” on the sign?`,
    }
    return confirm[field] ?? 'Is this right?'
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
  const [here, setHere] = useState<Here | null>(null)
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
      // The map pin is only asked when this phone is at the restaurant (location already allowed).
      const now = await hereNow()
      const near = nearEnough(now, { lat: r.latitude, lng: r.longitude })
      if (cancelled) return
      setHere(near ? now : null)
      const next = await nextQuestion(supabase, r.id, near ? [] : ['location'])
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

  // Only Crumbs' own values and open data are shown back — never Google's (members tell us
  // what they see). The name is the exception: it's on the sign and on your own list anyway.
  const ownValue = SHOW_VALUE.includes(q.reason) || field === 'name' ? valueOf(r, field) : null
  const current =
    ownValue === null || field === 'location'
      ? null
      : field === 'hours'
        ? hoursToText(ownValue as Hours) || null
        : String(ownValue)
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
            onClick={() =>
              field === 'location'
                ? here && answer({ lat: here.lat, lng: here.lng })
                : confirming
                  ? answer(ownValue)
                  : setTyping({ initial: null })
            }
          >
            Yes
          </button>
          <button
            className="chip chip-sm"
            // "No" to a confirmation = it changed: say what it is now. "No" to "Know …?" or
            // "Are you there?" = skip it for a while.
            onClick={() =>
              field === 'location' ? skip(30) : confirming ? setTyping({ initial: null }) : skip(90)
            }
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
