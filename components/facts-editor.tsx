'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import { ALLERGENS, normaliseFacts, type Facts } from '@/lib/place-info'

type Pick<T> = { value: T; label: string }
const NOISE: Pick<Facts['noise']>[] = [{ value: 'quiet', label: 'Quiet' }, { value: 'normal', label: 'Normal' }, { value: 'loud', label: 'Loud' }]
const PARKING: Pick<Facts['parking']>[] = [{ value: 'easy', label: 'Easy' }, { value: 'hard', label: 'Hard' }, { value: 'none', label: 'None' }]
const WAIT: Pick<Facts['wait']>[] = [{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }]

/** Practical facts about a place. Warnings show on cards when they clash with what you each avoid. */
export function FactsEditor({
  place,
  supabase,
  demo,
  userId,
  onUpdate,
}: {
  place: Place
  supabase: any
  demo: boolean
  userId?: string
  onUpdate: (place: Place) => void
}) {
  const facts = normaliseFacts(place.place_facts)
  const [note, setNote] = useState(facts?.note ?? '')
  const blank: Facts = { place_id: place.id, noise: null, parking: null, accessible: null, wait: null, cash_only: false, allergens: [], note: null }

  async function save(patch: Partial<Facts>) {
    const next: Facts = { ...(facts ?? blank), ...patch }
    onUpdate({ ...place, place_facts: next })
    if (demo) return
    const { error } = await supabase.from('place_facts').upsert({
      place_id: place.id,
      noise: next.noise,
      parking: next.parking,
      accessible: next.accessible,
      wait: next.wait,
      cash_only: next.cash_only,
      allergens: next.allergens,
      note: next.note,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      onUpdate(place)
      toast.error(error.message)
    }
  }

  function row<T>(title: string, options: Pick<T>[], current: T | null, set: (v: T | null) => void) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <div className="chip-row">
          {options.map((option) => (
            <button
              key={String(option.value)}
              aria-pressed={current === option.value}
              className={`chip chip-sm ${current === option.value ? 'chip-active' : ''}`}
              onClick={() => set(current === option.value ? null : option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <details className="surface-soft">
      <summary className="cursor-pointer font-serif text-xl font-bold">Dealbreakers &amp; details</summary>
      <div className="mt-3 flex flex-col gap-3">
        {row('Noise', NOISE, facts?.noise ?? null, (noise) => save({ noise }))}
        {row('Parking', PARKING, facts?.parking ?? null, (parking) => save({ parking }))}
        {row('Wait for a table', WAIT, facts?.wait ?? null, (wait) => save({ wait }))}
        <div className="chip-row">
          <button
            aria-pressed={facts?.accessible === false}
            className={`chip chip-sm ${facts?.accessible === false ? 'chip-active' : ''}`}
            onClick={() => save({ accessible: facts?.accessible === false ? null : false })}
          >
            ♿ Not accessible
          </button>
          <button
            aria-pressed={!!facts?.cash_only}
            className={`chip chip-sm ${facts?.cash_only ? 'chip-active' : ''}`}
            onClick={() => save({ cash_only: !facts?.cash_only })}
          >
            💵 Cash only
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Hard to avoid here</p>
          <div className="chip-row">
            {ALLERGENS.map((item) => {
              const on = facts?.allergens.includes(item)
              return (
                <button
                  key={item}
                  aria-pressed={!!on}
                  className={`chip chip-sm ${on ? 'chip-active' : ''}`}
                  onClick={() =>
                    save({ allergens: on ? facts!.allergens.filter((a) => a !== item) : [...(facts?.allergens ?? []), item] })
                  }
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>
        <textarea
          aria-label="Anything else to know"
          className="field min-h-16"
          placeholder="Anything else to know (e.g. “no reservations, line out the door”)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => note.trim() !== (facts?.note ?? '') && save({ note: note.trim() || null })}
        />
        <p className="text-xs text-muted-foreground">
          Set what each of you avoids in the Group tab and warnings appear on this place automatically.
        </p>
      </div>
    </details>
  )
}
