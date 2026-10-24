'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Place, PlaceVisit, Profile, VisitKind } from '@/hooks/use-crumbs-data'
import { fromInput, type Scale } from '@/lib/ratings'
import { haptic } from '@/lib/motion'
import { ScoreDisplay, ScoreInput } from './score-input'

const today = () => new Date().toISOString().slice(0, 10)
const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`
export const KINDS: { id: VisitKind; label: string }[] = [
  { id: 'dine_in', label: '🍽️ Dine in' },
  { id: 'takeout', label: '🥡 Takeout' },
  { id: 'delivery', label: '🛵 Delivery' },
]
export const OCCASIONS = [
  { id: 'date', label: '💕 Date' },
  { id: 'celebration', label: '🎉 Celebration' },
] as const

/** #5 trend: compares the last scored visit with the ones before it. */
export function visitTrend(visits: PlaceVisit[]) {
  const scored = visits
    .filter((visit) => typeof visit.score === 'number')
    .sort((a, b) => a.visited_on.localeCompare(b.visited_on))
  if (scored.length < 2) return null
  const last = scored.at(-1)!.score!
  const before = scored.slice(0, -1).reduce((sum, v) => sum + v.score!, 0) / (scored.length - 1)
  if (last - before >= 0.75) return 'up'
  if (before - last >= 0.75) return 'down'
  return 'same'
}

export function VisitsPanel({
  place,
  userId,
  supabase,
  demo,
  onUpdate,
  v4 = false,
  scale = '5',
  members = [],
  names = {},
  turns = false,
}: {
  place: Place
  userId?: string
  supabase: any
  demo: boolean
  onUpdate: (place: Place) => void
  v4?: boolean
  scale?: Scale
  members?: Profile[]
  names?: Record<string, string>
  turns?: boolean
}) {
  const [date, setDate] = useState(today)
  const [spend, setSpend] = useState('')
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [kind, setKind] = useState<VisitKind>('dine_in')
  const [people, setPeople] = useState('')
  const [score, setScore] = useState(0)
  const [pickedBy, setPickedBy] = useState('')
  const [occasion, setOccasion] = useState<'date' | 'celebration' | null>(null)
  const [milestone, setMilestone] = useState('')
  const [note, setNote] = useState('')
  const visits = [...(place.place_visits ?? [])].sort((a, b) =>
    b.visited_on.localeCompare(a.visited_on),
  )
  const total = visits.reduce((sum, visit) => sum + (visit.spend ?? 0), 0)
  const trend = visitTrend(visits)
  const perHead = visits.filter((v) => v.spend && v.people)
  const avgPerHead = perHead.length
    ? perHead.reduce((sum, v) => sum + Number(v.spend) / v.people!, 0) / perHead.length
    : null

  async function apply(next: PlaceVisit[]) {
    const latest =
      next
        .map((visit) => visit.visited_on)
        .sort()
        .at(-1) ?? null
    onUpdate({ ...place, place_visits: next, visited_on: latest })
    // Cards still show the latest date, so keep that column in step.
    if (!demo) await supabase.from('places').update({ visited_on: latest }).eq('id', place.id)
  }

  async function add() {
    if (!date) return toast.error('Pick a date')
    const amount = spend.trim() ? Number(spend.replace(/[^0-9.]/g, '')) : null
    if (amount !== null && (Number.isNaN(amount) || amount > 100000))
      return toast.error('That amount looks off')
    const heads = people.trim() ? Math.round(Number(people)) : null
    if (heads !== null && (!Number.isFinite(heads) || heads < 1 || heads > 50))
      return toast.error('How many people? (1-50)')
    setBusy(true)
    try {
      const extra = v4
        ? {
            kind,
            people: heads,
            score: score ? fromInput(score, scale).points / 20 : null,
            picked_by: pickedBy || null,
            occasion,
            milestone: milestone.trim() || null,
            note: note.trim() || null,
          }
        : {}
      let row: PlaceVisit = {
        id: crypto.randomUUID(),
        place_id: place.id,
        visited_on: date,
        spend: amount,
        created_by: userId,
        ...extra,
      }
      if (!demo) {
        const { data, error } = await supabase
          .from('place_visits')
          .insert({
            place_id: place.id,
            visited_on: date,
            spend: amount,
            created_by: userId,
            ...extra,
          })
          .select('*')
          .single()
        if (error) throw error
        row = data
      }
      await apply([...(place.place_visits ?? []), row])
      haptic('success')
      setSpend('')
      setPeople('')
      setScore(0)
      setOccasion(null)
      setMilestone('')
      setNote('')
      setMore(false)
      toast.success('Visit logged')
    } catch (error: any) {
      toast.error(error?.message || 'Could not log that visit')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const before = place.place_visits ?? []
    if (!demo) {
      const { error } = await supabase.from('place_visits').delete().eq('id', id)
      if (error) return toast.error(error.message)
    }
    await apply(before.filter((visit) => visit.id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl font-bold">Visits</h3>
        {visits.length > 0 && (
          <span className="text-right text-xs text-muted-foreground">
            {visits.length} visit{visits.length === 1 ? '' : 's'}
            {total > 0 ? ` · ${money(total)} total` : ''}
            {avgPerHead ? ` · ~${money(avgPerHead)} a head` : ''}
          </span>
        )}
      </div>
      {trend && trend !== 'same' && (
        <p className={`trend-pill ${trend === 'up' ? 'trend-up' : 'trend-down'}`}>
          {trend === 'up' ? '↗ Getting better every visit' : '↘ Not as good as it used to be'}
        </p>
      )}
      {visits.map((visit) => (
        <div className="surface-soft flex flex-col gap-1 text-sm" key={visit.id}>
          <div className="flex items-center justify-between gap-2">
            <span>
              {new Date(`${visit.visited_on}T12:00:00`).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {visit.kind && visit.kind !== 'dine_in'
                ? ` · ${KINDS.find((k) => k.id === visit.kind)?.label}`
                : ''}
              {visit.spend ? ` · ${money(Number(visit.spend))}` : ''}
              {visit.spend && visit.people
                ? ` (${money(Number(visit.spend) / visit.people)} each)`
                : ''}
            </span>
            <span className="flex items-center gap-2">
              {typeof visit.score === 'number' && (
                <ScoreDisplay
                  rating={{ score: Math.round(visit.score), points: Math.round(visit.score * 20) }}
                  scale={scale}
                  label="Visit score"
                />
              )}
              <button
                className="text-xs underline"
                onClick={() => remove(visit.id)}
                aria-label="Delete this visit"
              >
                Delete
              </button>
            </span>
          </div>
          {(visit.occasion || visit.milestone || visit.picked_by || visit.note) && (
            <p className="text-xs text-muted-foreground">
              {visit.occasion && (
                <span className="tag mr-1">
                  {OCCASIONS.find((o) => o.id === visit.occasion)?.label}
                </span>
              )}
              {visit.milestone && <span className="tag mr-1">🏆 {visit.milestone}</span>}
              {visit.picked_by && (
                <>
                  Picked by{' '}
                  {visit.picked_by === userId ? 'you' : (names[visit.picked_by] ?? 'someone')}.{' '}
                </>
              )}
              {visit.note}
            </p>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          aria-label="Date you visited"
          className="field !w-auto min-w-0 flex-1"
          type="date"
          max={today()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <input
          aria-label="What you spent (optional)"
          className="field !w-24"
          inputMode="decimal"
          placeholder="$ spent"
          value={spend}
          onChange={(event) => setSpend(event.target.value)}
        />
        <button className="primary !min-h-11 !px-3 text-sm" disabled={busy} onClick={add}>
          Log
        </button>
      </div>
      {v4 && (
        <button
          className="self-start text-xs font-semibold text-primary underline"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {more ? 'Fewer details' : 'More details (how it went, who came, occasion…)'}
        </button>
      )}
      {v4 && more && (
        <div className="visit-more surface-soft flex flex-col gap-3">
          <div className="chip-row" role="radiogroup" aria-label="How you ate">
            {KINDS.map((item) => (
              <button
                key={item.id}
                role="radio"
                aria-checked={kind === item.id}
                className={`chip chip-sm ${kind === item.id ? 'chip-active' : ''}`}
                onClick={() => setKind(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">This visit</span>
            <ScoreInput value={score} scale={scale} onChange={setScore} label="This visit" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold" htmlFor="visit-people">
              People
            </label>
            <input
              id="visit-people"
              className="field !w-20"
              inputMode="numeric"
              placeholder="2"
              value={people}
              onChange={(event) => setPeople(event.target.value.replace(/\D/g, ''))}
            />
            {turns && members.length > 1 && (
              <select
                aria-label="Who picked this place"
                className="field !w-auto min-w-0 flex-1"
                value={pickedBy}
                onChange={(event) => setPickedBy(event.target.value)}
              >
                <option value="">Who picked?</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === userId ? 'Me' : member.display_name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="chip-row" role="group" aria-label="Occasion">
            {OCCASIONS.map((item) => (
              <button
                key={item.id}
                aria-pressed={occasion === item.id}
                className={`chip chip-sm ${occasion === item.id ? 'chip-active' : ''}`}
                onClick={() => setOccasion(occasion === item.id ? null : item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            className="field"
            aria-label="Milestone (optional)"
            placeholder="Milestone? (first date, anniversary, new job…)"
            maxLength={60}
            value={milestone}
            onChange={(event) => setMilestone(event.target.value)}
          />
          <input
            className="field"
            aria-label="Note about this visit"
            placeholder="Anything to remember about this visit?"
            maxLength={280}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      )}
    </div>
  )
}
