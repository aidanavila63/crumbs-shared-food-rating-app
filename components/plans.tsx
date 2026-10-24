'use client'
// #48 Plan a dinner (time, place, note, RSVPs) and #76 add it to your calendar (.ics file).
import { useState } from 'react'
import { CalendarPlus, CalendarDays, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import type { DecideStore, Plan, Rsvp } from '@/hooks/use-decide'
import { planIcs } from '@/lib/decide'
import { haptic } from '@/lib/motion'

export type PlanDraft = Partial<Plan> & { title: string }

const ANSWERS: { id: Rsvp['answer']; label: string }[] = [
  { id: 'yes', label: '👍 In' },
  { id: 'maybe', label: '🤔 Maybe' },
  { id: 'no', label: '🙅 Can’t' },
]

export function planWhen(iso: string | null) {
  if (!iso) return 'Date to be decided'
  const d = new Date(iso)
  const today = new Date()
  const days = Math.round(
    (new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 864e5,
  )
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today · ${time}`
  if (days === 1) return `Tomorrow · ${time}`
  if (days > 1 && days < 7)
    return `${d.toLocaleDateString(undefined, { weekday: 'long' })} · ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${time}`
}

/** datetime-local wants "yyyy-mm-ddThh:mm" in local time. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function downloadIcs(plan: Plan, place?: Place | null) {
  const ics = planIcs(plan, place)
  if (!ics) return toast('Pick a date and time first')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.title.replace(/[^\w -]/g, '').slice(0, 40) || 'dinner'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export const upcomingPlans = (plans: Plan[]) => {
  const cutoff = Date.now() - 3 * 36e5
  return plans
    .filter((p) => !p.starts_at || new Date(p.starts_at).getTime() >= cutoff)
    .sort((a, b) => (a.starts_at ?? '9999').localeCompare(b.starts_at ?? '9999'))
}

/** Small card for Decide & Plan: the next plans + a button into the Plans page. */
export function PlansCard({
  store,
  places,
  userId,
  onOpen,
}: {
  store: DecideStore
  places: Place[]
  userId?: string
  onOpen: () => void
}) {
  const next = upcomingPlans(store.plans).slice(0, 2)
  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-2xl font-bold">Plans</h3>
        <button className="primary !min-h-10 !px-3 text-sm" onClick={onOpen}>
          <CalendarPlus size={16} /> Plan a dinner
        </button>
      </div>
      {next.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing planned. Pick a time and place, everyone says if they’re in.
        </p>
      )}
      {next.map((plan) => {
        const place = places.find((p) => p.id === plan.place_id)
        const mine = store.rsvps.find((r) => r.plan_id === plan.id && r.user_id === userId)
        return (
          <button
            key={plan.id}
            className="surface-soft flex items-center gap-3 text-left"
            onClick={onOpen}
          >
            <span className="feed-icon" aria-hidden="true">
              <CalendarDays size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{plan.title}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {planWhen(plan.starts_at)}
                {place ? ` · ${place.name}` : ''}
              </span>
            </span>
            {!mine && <span className="tag shrink-0">Reply</span>}
          </button>
        )
      })}
    </div>
  )
}

export function PlansPage({
  store,
  places,
  members,
  userId,
  names,
  draft,
  onDraft,
  onOpenPlace,
  onVoteForPlace,
}: {
  store: DecideStore
  places: Place[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
  draft: PlanDraft | null
  onDraft: (draft: PlanDraft | null) => void
  onOpenPlace: (place: Place) => void
  /** Start a Decide together vote for this plan's place. */
  onVoteForPlace: (plan: Plan) => void
}) {
  const upcoming = upcomingPlans(store.plans)
  const past = store.plans
    .filter((p) => !upcoming.includes(p))
    .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))
    .slice(0, 5)
  return (
    <div className="stagger flex flex-col gap-4">
      {draft ? (
        <PlanForm draft={draft} places={places} store={store} onDone={() => onDraft(null)} />
      ) : (
        <button className="primary" onClick={() => onDraft({ title: '' })}>
          <CalendarPlus size={18} /> Plan a dinner
        </button>
      )}
      {upcoming.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          store={store}
          places={places}
          members={members}
          userId={userId}
          names={names}
          onEdit={() => onDraft(plan)}
          onOpenPlace={onOpenPlace}
          onVoteForPlace={() => onVoteForPlace(plan)}
        />
      ))}
      {!upcoming.length && !draft && (
        <p className="empty text-sm text-muted-foreground">No plans coming up.</p>
      )}
      {past.length > 0 && (
        <div className="surface flex flex-col gap-2">
          <h3 className="settings-heading">Past plans</h3>
          {past.map((plan) => {
            const place = places.find((p) => p.id === plan.place_id)
            return (
              <p key={plan.id} className="text-sm">
                <strong>{plan.title}</strong>
                <span className="text-muted-foreground">
                  {' '}
                  · {planWhen(plan.starts_at)}
                  {place ? ` · ${place.name}` : ''}
                </span>
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlanCard({
  plan,
  store,
  places,
  members,
  userId,
  names,
  onEdit,
  onOpenPlace,
  onVoteForPlace,
}: {
  plan: Plan
  store: DecideStore
  places: Place[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
  onEdit: () => void
  onOpenPlace: (place: Place) => void
  onVoteForPlace: () => void
}) {
  const place = places.find((p) => p.id === plan.place_id)
  const answers = store.rsvps.filter((r) => r.plan_id === plan.id)
  const mine = answers.find((r) => r.user_id === userId)?.answer
  const voting = plan.session_id ? store.sessions.find((s) => s.id === plan.session_id) : null
  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-serif text-2xl font-bold">{plan.title}</h3>
          <p className="font-semibold text-primary">{planWhen(plan.starts_at)}</p>
          {place ? (
            <button
              className="text-left text-sm font-semibold underline"
              onClick={() => onOpenPlace(place)}
            >
              📍 {place.name}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Place not picked yet</p>
          )}
          {plan.note && <p className="mt-1 text-sm text-muted-foreground">{plan.note}</p>}
        </div>
        <button className="text-xs font-bold text-primary underline" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="segmented segmented-3" role="radiogroup" aria-label="Are you in?">
        <span
          className="segmented-thumb"
          aria-hidden="true"
          style={{
            transform: `translateX(${
              Math.max(
                0,
                ANSWERS.findIndex((a) => a.id === mine),
              ) * 100
            }%)`,
            opacity: mine ? 1 : 0,
          }}
        />
        {ANSWERS.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={mine === a.id}
            className={mine === a.id ? 'segmented-active' : ''}
            onClick={() => {
              haptic('select')
              store.answer(plan.id, a.id)
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {members.map((member) => {
          const a = answers.find((r) => r.user_id === member.id)?.answer
          return (
            <span key={member.id} className={`chip chip-sm ${a === 'yes' ? 'chip-active' : ''}`}>
              {member.id === userId ? 'You' : (names[member.id] ?? member.display_name)}:{' '}
              {a ? ANSWERS.find((x) => x.id === a)!.label.replace(/^\S+\s/, '') : '…'}
            </span>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {plan.starts_at && (
          <button
            className="secondary flex-1 !min-h-10 text-sm"
            onClick={() => downloadIcs(plan, place)}
          >
            <CalendarPlus size={16} /> Add to calendar
          </button>
        )}
        {!place && (
          <button className="secondary flex-1 !min-h-10 text-sm" onClick={onVoteForPlace}>
            {voting ? 'Open the vote' : 'Vote on the place'}
          </button>
        )}
        <button
          className="icon-btn"
          aria-label={`Delete ${plan.title}`}
          onClick={() =>
            window.confirm(`Delete “${plan.title}” for everyone?`) && store.deletePlan(plan.id)
          }
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

function PlanForm({
  draft,
  places,
  store,
  onDone,
}: {
  draft: PlanDraft
  places: Place[]
  store: DecideStore
  onDone: () => void
}) {
  const [title, setTitle] = useState(draft.title)
  const [when, setWhen] = useState(toLocalInput(draft.starts_at))
  const [placeId, setPlaceId] = useState(draft.place_id ?? '')
  const [note, setNote] = useState(draft.note ?? '')
  const [busy, setBusy] = useState(false)
  const sorted = [...places].sort((a, b) =>
    a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'Want to try' ? -1 : 1,
  )
  async function save() {
    const place = places.find((p) => p.id === placeId)
    const name = title.trim() || (place ? `Dinner at ${place.name}` : 'Dinner')
    setBusy(true)
    const id = await store.savePlan({
      ...draft,
      title: name,
      starts_at: when ? new Date(when).toISOString() : null,
      place_id: placeId || null,
      note,
    })
    setBusy(false)
    if (!id) return
    // A vote that ended in this plan is finished.
    if (!draft.id && draft.session_id) store.closeSession(draft.session_id)
    haptic('success')
    toast.success(draft.id ? 'Plan updated' : 'Plan made — everyone can say if they’re in')
    onDone()
  }
  return (
    <div className="surface rise-panel flex flex-col gap-3">
      <h3 className="font-serif text-2xl font-bold">{draft.id ? 'Edit plan' : 'Plan a dinner'}</h3>
      <input
        className="field"
        aria-label="What's the plan?"
        placeholder="What’s the plan? (e.g. Friday dinner)"
        maxLength={80}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        When
        <input
          className="field"
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Where
        <select
          className="field"
          value={placeId}
          onChange={(event) => setPlaceId(event.target.value)}
        >
          <option value="">Decide later (or vote on it)</option>
          {sorted.map((place) => (
            <option key={place.id} value={place.id}>
              {place.status === 'Want to try' ? '✨ ' : ''}
              {place.name}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="field min-h-16"
        aria-label="Note"
        placeholder="Note (booking time, who's driving…)"
        maxLength={500}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <button className="secondary" onClick={onDone}>
          Cancel
        </button>
        <button className="primary flex-1" disabled={busy} onClick={save}>
          {draft.id ? 'Save' : 'Make the plan'}
        </button>
      </div>
    </div>
  )
}
