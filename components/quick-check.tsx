'use client'
// One small question at a time, only when it's useful (you've been there, the answer's missing
// or only borrowed from Google). Answers build Crumbs' own restaurant data. Easy to ignore:
// at most one question per place every two weeks and three a day, and it can be switched off.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import { needsHelp, type FactField } from '@/lib/restaurants'
import { localUtcOffset, parseHoursText, hoursToText } from '@/lib/hours-text'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { ReadPhotoButton } from './photo-reader'
import { FactEditor, thanks } from './restaurant-profile'

export const QUICK_CHECKS_KEY = 'crumbs-quick-checks' // 'off' to switch them off
const ASKABLE: FactField[] = ['hours', 'price_level', 'status', 'website', 'phone']
const today = () => new Date().toISOString().slice(0, 10)

function pickQuestion(placeKey: string, fields: FactField[]): FactField | null {
  try {
    if (localStorage.getItem(QUICK_CHECKS_KEY) === 'off') return null
    const last = Number(localStorage.getItem(`crumbs-qc-${placeKey}`) ?? 0)
    if (Date.now() - last < 14 * 864e5) return null
    const day = JSON.parse(localStorage.getItem('crumbs-qc-day') ?? '{}')
    if (day.d === today() && day.n >= 3) return null
  } catch {
    return null
  }
  return ASKABLE.find((f) => fields.includes(f)) ?? null
}

function markAsked(placeKey: string) {
  try {
    localStorage.setItem(`crumbs-qc-${placeKey}`, String(Date.now()))
    const day = JSON.parse(localStorage.getItem('crumbs-qc-day') ?? '{}')
    localStorage.setItem(
      'crumbs-qc-day',
      JSON.stringify({ d: today(), n: day.d === today() ? day.n + 1 : 1 }),
    )
  } catch {}
}

export function QuickCheck({
  place,
  store,
  onHours,
}: {
  place: Place
  store: RestaurantStore
  onHours: (hours: Hours) => void
}) {
  const r = store.restaurant
  const [field, setField] = useState<FactField | null>(null)
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    if (!r || place.status !== 'Been') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setField(pickQuestion(r.id, needsHelp(r)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, place.status])
  if (!r || !field) return null

  const close = () => {
    markAsked(r.id)
    setField(null)
  }
  async function answer(val: unknown, how: 'in_person' | 'photo' = 'in_person') {
    try {
      const result = await store.contribute(field!, val, how)
      if (!result) return
      haptic('success')
      track('quick_check', { field: field!, how })
      if (field === 'hours') onHours(val as Hours)
      toast.success(thanks(field!, result))
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
    close()
  }

  const question: Record<string, string> = {
    hours: `Know ${place.name}’s hours?`,
    price_level: 'How pricey is it?',
    status: 'Still open as usual?',
    website: 'Got their website?',
    phone: 'Got their phone number?',
  }
  return (
    <div className="quick-check rise-panel" role="group" aria-label="Quick question">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          <span aria-hidden="true">💬 </span>
          {question[field]}
        </p>
        <button className="text-muted-foreground" aria-label="Not now" onClick={close}>
          <X size={16} />
        </button>
      </div>
      {typing ? (
        <FactEditor
          field={field}
          initial={null}
          utc={(r.opening_hours as Hours | null)?.utc ?? localUtcOffset()}
          onCancel={() => setTyping(false)}
          onSave={(val, how) => answer(val, how === 'photo' ? 'photo' : 'in_person')}
        />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {field === 'hours' && (
            <>
              <ReadPhotoButton
                label="Snap the sign"
                className="chip chip-sm"
                onText={(read) => {
                  const hours = parseHoursText(read, r.opening_hours?.utc ?? localUtcOffset())
                  if (!hours) return toast('Couldn’t read hours there — try typing them')
                  toast(`Read: ${hoursToText(hours)}`)
                  answer(hours, 'photo')
                }}
              />
              <button className="chip chip-sm" onClick={() => setTyping(true)}>
                Type them
              </button>
            </>
          )}
          {field === 'price_level' &&
            [1, 2, 3, 4].map((n) => (
              <button key={n} className="chip chip-sm" onClick={() => answer(n)}>
                {'$'.repeat(n)}
              </button>
            ))}
          {field === 'status' && (
            <>
              <button className="chip chip-sm" onClick={() => answer('OPERATIONAL')}>
                Yes, open
              </button>
              <button className="chip chip-sm" onClick={() => answer('CLOSED_TEMPORARILY')}>
                Closed for now
              </button>
              <button className="chip chip-sm" onClick={() => answer('CLOSED_PERMANENTLY')}>
                Closed for good
              </button>
            </>
          )}
          {(field === 'website' || field === 'phone') && (
            <button className="chip chip-sm" onClick={() => setTyping(true)}>
              Add it
            </button>
          )}
          <button className="chip chip-sm" onClick={close}>
            Not sure
          </button>
        </div>
      )}
    </div>
  )
}
