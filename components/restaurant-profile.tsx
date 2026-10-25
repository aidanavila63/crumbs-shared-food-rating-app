'use client'
// #27 "Restaurant info": the shared profile, field by field, with where each fact came from.
// Members add what they see (or snap the hours sign) so Crumbs owns its data instead of
// borrowing Google's. Members' facts beat open data (OpenStreetMap), which beats Google.
import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import {
  PROFILE_FIELDS,
  claimRestaurant,
  ownerLocked,
  type Evidence,
  type FactField,
  type FactResult,
  type Restaurant,
} from '@/lib/restaurants'
import { findPhone, findWebsite } from '@/lib/fact-parse'
import { hoursToText, localUtcOffset, parseHoursText } from '@/lib/hours-text'
import type { Hours } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
import { track } from '@/lib/analytics'
import { ReadPhotoButton } from './photo-reader'

const LABEL: Record<FactField, string> = {
  name: 'Name',
  address: 'Address',
  location: 'Map pin',
  hours: 'Hours',
  phone: 'Phone',
  website: 'Website',
  price_level: 'Price',
  cuisine: 'Cuisine',
  status: 'Open?',
}
/** Thank-you line after a contribution. Only new info earns points, so most say none. */
export function thanks(fact: FactField, result: FactResult) {
  if (result.locked) return 'Sent to the restaurant — they keep this page up to date'
  const pts = result.points ? ` · +${result.points} points` : ''
  if (result.claimed && result.agree > 1)
    return `Thanks! That’s now checked by ${result.agree} people${pts}`
  if (result.applied) return `Thanks — ${LABEL[fact].toLowerCase()} saved for everyone${pts}`
  return `Thanks — saved. One more person agreeing will update it${pts}`
}

/** The blue check (like verified accounts on Instagram): an approved owner runs this page. */
export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="verified-badge" title="Verified by Owner">
      <BadgeCheck size={compact ? 16 : 18} aria-hidden="true" />
      {compact ? <span className="sr-only">Verified by Owner</span> : 'Verified by Owner'}
    </span>
  )
}

export const STATUS: { id: string; label: string }[] = [
  { id: 'OPERATIONAL', label: 'Open as usual' },
  { id: 'CLOSED_TEMPORARILY', label: 'Temporarily closed' },
  { id: 'CLOSED_PERMANENTLY', label: 'Closed for good' },
]
const EVIDENCE: { id: Evidence; label: string }[] = [
  { id: 'in_person', label: 'I was there' },
  { id: 'photo', label: 'Photo' },
  { id: 'website', label: 'Their website' },
  { id: 'phone_call', label: 'Called them' },
]

function valueOf(r: Restaurant, f: FactField): unknown {
  switch (f) {
    case 'address':
      return r.formatted_address
    case 'hours':
      return r.opening_hours
    case 'phone':
      return r.phone
    case 'website':
      return r.website
    case 'price_level':
      return r.price_level
    case 'cuisine':
      return r.cuisine
    case 'status':
      return r.business_status
    default:
      return null
  }
}

function show(r: Restaurant, f: FactField) {
  const v = valueOf(r, f)
  if (v === null || v === undefined || v === '') return null
  if (f === 'hours') return hoursToText(v as Hours) || null
  if (f === 'price_level') return '$'.repeat(Math.max(1, Number(v)))
  if (f === 'phone') return String(v)
  if (f === 'status') return STATUS.find((s) => s.id === v)?.label ?? String(v)
  if (f === 'website') {
    try {
      return new URL(String(v)).hostname.replace(/^www\./, '')
    } catch {
      return String(v)
    }
  }
  return String(v)
}

export function RestaurantInfoEditor({
  store,
  onHours,
  supabase,
  claims = false,
  startEditing,
}: {
  /** open straight onto one detail (e.g. hours from the place header) */
  startEditing?: FactField
  supabase?: any
  /** #100 restaurant claims switched on (admin switch "restaurant_claims") */
  claims?: boolean
  store: RestaurantStore
  /** Hours a member entered: also update this group's copy so the "Open now" line uses them. */
  onHours: (hours: Hours) => void
}) {
  const [editing, setEditing] = useState<FactField | null>(startEditing ?? null)
  const r = store.restaurant
  if (!store.enabled || !r) return null

  async function save(fact: FactField, val: unknown, how: Evidence) {
    try {
      const result = await store.contribute(fact, val, how)
      if (!result) return
      haptic('success')
      track('fact_added', { fact, how, applied: result.applied })
      if (fact === 'hours' && !result.locked) onHours(val as Hours)
      toast.success(thanks(fact, result))
      setEditing(null)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {
        <div className="flex flex-col">
          {r.owner_verified && (
            <div className="mb-2">
              <VerifiedBadge />
            </div>
          )}
          {store.manages ? (
            <p className="mb-2 rounded-xl bg-[var(--card)] px-3 py-2 text-sm">
              <strong>🏪 You manage {r.name}.</strong> Your changes go live straight away for
              everyone. Your restaurants (in your profile) has the menu and what members suggest.
            </p>
          ) : r.owner_verified ? (
            <p className="mb-2 text-sm text-muted-foreground">
              The restaurant keeps these details up to date. Spot something wrong? Tell them below —
              they’ll see it.
            </p>
          ) : (
            <p className="mb-2 text-sm text-muted-foreground">
              Fix or add anything you’ve seen yourself. It helps everyone who saves this place, and
              new info earns you Crumbs points.
            </p>
          )}
          {store.insights && store.insights.visits > 0 && (
            <p className="mb-1 rounded-xl bg-[var(--card)] px-3 py-2 text-sm">
              <strong>From Crumbs:</strong> {store.insights.visits} visit
              {store.insights.visits === 1 ? '' : 's'}
              {store.insights.groups > 1 ? ` by ${store.insights.groups} groups` : ''}
              {store.insights.per_head ? ` · about $${store.insights.per_head} a person` : ''}
              {store.insights.takeout_share !== null
                ? ` · ${store.insights.takeout_share}% of visits were takeout or delivery`
                : ''}
            </p>
          )}
          {PROFILE_FIELDS.map((f) => {
            const text = show(r, f)
            const owned =
              r.sources?.[f] === 'owner' || r.sources?.[f] === 'crumbs' || r.sources?.[f] === 'osm'
            const locked = !store.manages && ownerLocked(r, f)
            return (
              <div key={f} className="profile-row flex flex-col gap-1 py-2">
                <div className="flex items-start gap-2">
                  <span className="w-16 shrink-0 text-sm font-semibold">{LABEL[f]}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {text ?? <span className="text-muted-foreground">Not known yet</span>}
                  </span>
                  {r.sources?.[f] === 'owner' && text ? (
                    <VerifiedBadge compact />
                  ) : (
                    r.verified?.[f]?.claimed && (
                      <span
                        className="text-xs font-bold text-[#2f7d4f]"
                        title="Checked by several people"
                      >
                        ✓
                      </span>
                    )
                  )}
                </div>
                {editing !== f && locked && (
                  <div className="flex gap-3 pl-[72px] text-xs font-semibold">
                    <button className="text-primary underline" onClick={() => setEditing(f)}>
                      {text ? 'Tell the restaurant it’s changed' : 'Tell the restaurant'}
                    </button>
                  </div>
                )}
                {editing !== f && !locked && (
                  <div className="flex gap-3 pl-[72px] text-xs font-semibold">
                    {owned && text && !store.manages && (
                      <button
                        className="text-[#2f7d4f] underline"
                        onClick={() => save(f, valueOf(r, f), 'in_person')}
                      >
                        Still right
                      </button>
                    )}
                    <button className="text-primary underline" onClick={() => setEditing(f)}>
                      {text ? 'Edit' : 'Add'}
                    </button>
                  </div>
                )}
                {editing === f && (
                  <FactEditor
                    field={f}
                    // Google's value isn't offered as a starting point: members enter what they see.
                    initial={owned ? valueOf(r, f) : null}
                    utc={(r.opening_hours as Hours | null)?.utc ?? localUtcOffset()}
                    saveLabel={locked ? 'Send to the restaurant' : undefined}
                    onCancel={() => setEditing(null)}
                    onSave={(val, how) => save(f, val, how)}
                  />
                )}
              </div>
            )
          })}
          {r.price_level ? (
            <div className="profile-row flex items-start gap-2 py-2">
              <span className="w-16 shrink-0 text-sm font-semibold">Price</span>
              <span className="min-w-0 flex-1 text-sm">
                {'$'.repeat(r.price_level)}
                {r.sources?.price_level === 'owner' || r.sources?.price_level === 'crumbs' ? (
                  <span className="text-muted-foreground"> · from menu prices</span>
                ) : (
                  <span className="text-muted-foreground"> · snap the menu to keep this right</span>
                )}
              </span>
            </div>
          ) : null}
          {r.osm_id && (
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              Some details © OpenStreetMap contributors.
            </p>
          )}
          {claims && !store.manages && supabase && (
            <ClaimForm restaurantId={r.id} name={r.name} supabase={supabase} />
          )}
        </div>
      }
    </div>
  )
}

export function FactEditor({
  field,
  initial,
  utc,
  onCancel,
  onSave,
  saveLabel = 'Save for everyone',
  initialHow,
  hideHow = false,
}: {
  field: FactField
  initial: unknown
  utc: number
  onCancel: () => void
  onSave: (val: unknown, how: Evidence) => void
  saveLabel?: string
  /** e.g. 'photo' when the value was just read off a picture */
  initialHow?: Evidence
  /** the restaurant's own owner doesn't need to say how they know */
  hideHow?: boolean
}) {
  const [text, setText] = useState(
    field === 'hours'
      ? hoursToText(initial as Hours | null)
      : initial != null && typeof initial !== 'object'
        ? String(initial)
        : '',
  )
  const [choice, setChoice] = useState<string | number | null>(
    field === 'price_level' || field === 'status' ? (initial as string | number | null) : null,
  )
  const [how, setHow] = useState<Evidence>(
    initialHow ?? (field === 'website' ? 'website' : 'in_person'),
  )
  const hours = field === 'hours' ? parseHoursText(text, utc) : null
  let val: unknown = null
  if (field === 'hours') val = hours
  else if (field === 'price_level' || field === 'status') val = choice
  else if (text.trim())
    val =
      field === 'website' && !/^https?:\/\//i.test(text.trim())
        ? `https://${text.trim()}`
        : text.trim()

  return (
    <div className="rise-panel flex flex-col gap-2 rounded-2xl bg-[var(--card)] p-3">
      {field === 'hours' ? (
        <>
          <textarea
            className="field min-h-20 text-sm"
            aria-label="Opening hours"
            placeholder={'e.g. Mon-Fri 11am-10pm\nSat-Sun 12-11pm\nTue closed'}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <ReadPhotoButton
            label="Snap the hours sign"
            className="secondary self-start !min-h-9 !px-3 text-sm"
            onText={(read) => {
              const parsed = parseHoursText(read, utc)
              if (!parsed) return toast('Couldn’t make out the hours — type them in')
              setText(hoursToText(parsed))
              setHow('photo')
            }}
          />
          <p className="text-xs text-muted-foreground">
            {text.trim()
              ? hours
                ? `Reads as: ${hoursToText(hours)}`
                : 'Not sure how to read that yet'
              : ' '}
          </p>
        </>
      ) : field === 'price_level' ? (
        <div className="chip-row">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              aria-pressed={choice === n}
              className={`chip chip-sm ${choice === n ? 'chip-active' : ''}`}
              onClick={() => setChoice(n)}
            >
              {'$'.repeat(n)}
            </button>
          ))}
        </div>
      ) : field === 'status' ? (
        <div className="chip-row">
          {STATUS.map((s) => (
            <button
              key={s.id}
              aria-pressed={choice === s.id}
              className={`chip chip-sm ${choice === s.id ? 'chip-active' : ''}`}
              onClick={() => setChoice(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : (
        <input
          className="field !min-h-10 text-sm"
          aria-label={LABEL[field]}
          inputMode={field === 'phone' ? 'tel' : field === 'website' ? 'url' : undefined}
          placeholder={
            field === 'address'
              ? '123 Main St, City'
              : field === 'phone'
                ? '+1 555 123 4567'
                : field === 'website'
                  ? 'theirsite.com'
                  : field === 'name'
                    ? 'The name on the sign'
                    : 'e.g. Thai'
          }
          maxLength={field === 'cuisine' ? 60 : field === 'name' ? 160 : 300}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      {(field === 'phone' || field === 'website') && (
        <ReadPhotoButton
          label="Snap a picture"
          className="secondary self-start !min-h-9 !px-3 text-sm"
          onText={(read) => {
            const found = field === 'phone' ? findPhone(read) : findWebsite(read)
            if (!found)
              return toast(
                `Couldn’t spot a ${field === 'phone' ? 'number' : 'website'} — type it in`,
              )
            setText(found)
            setHow('photo')
          }}
        />
      )}
      <div className={`flex flex-wrap items-center gap-1.5 ${hideHow ? 'hidden' : ''}`}>
        <span className="text-xs text-muted-foreground">How do you know?</span>
        {EVIDENCE.map((e) => (
          <button
            key={e.id}
            aria-pressed={how === e.id}
            className={`chip chip-sm !min-h-8 ${how === e.id ? 'chip-active' : ''}`}
            onClick={() => setHow(e.id)}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="secondary !min-h-10 text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary !min-h-10 flex-1 text-sm"
          disabled={val === null || val === ''}
          onClick={() => onSave(val, how)}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

/** #100 "Own or manage this place?" — a request an admin checks before the owner gets control. */
function ClaimForm({
  restaurantId,
  name,
  supabase,
}: {
  restaurantId: string
  name: string
  supabase: any
}) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ contact: '', job: '', mail: '', tel: '', evidence: '' })
  const set = (k: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [k]: event.target.value })
  if (sent)
    return (
      <p className="mt-3 rounded-xl bg-[var(--card)] px-3 py-2 text-sm">
        Thanks — we’ll check your claim and let you know. Once confirmed, your changes go live
        straight away.
      </p>
    )
  if (!open)
    return (
      <button
        className="mt-3 self-start text-sm font-semibold text-primary underline"
        onClick={() => setOpen(true)}
      >
        Own or manage {name}? Claim this page
      </button>
    )
  return (
    <div className="rise-panel mt-3 flex flex-col gap-2 rounded-2xl bg-[var(--card)] p-3">
      <p className="font-semibold">Claim {name}</p>
      <p className="text-xs text-muted-foreground">
        We check every claim (usually by emailing or calling the restaurant). Once confirmed you can
        keep hours, menu and details right for everyone.
      </p>
      <input
        className="field !min-h-10 text-sm"
        aria-label="Your name"
        placeholder="Your name"
        maxLength={120}
        value={form.contact}
        onChange={set('contact')}
      />
      <input
        className="field !min-h-10 text-sm"
        aria-label="Your role"
        placeholder="Role (owner, manager…)"
        maxLength={60}
        value={form.job}
        onChange={set('job')}
      />
      <input
        className="field !min-h-10 text-sm"
        aria-label="Work email"
        type="email"
        placeholder="Work email (ideally at the restaurant’s website)"
        maxLength={200}
        value={form.mail}
        onChange={set('mail')}
      />
      <input
        className="field !min-h-10 text-sm"
        aria-label="Restaurant phone"
        inputMode="tel"
        placeholder="Restaurant phone we can call"
        maxLength={40}
        value={form.tel}
        onChange={set('tel')}
      />
      <textarea
        className="field min-h-16 text-sm"
        aria-label="Anything that shows it’s yours"
        placeholder="Anything that shows it’s yours (optional)"
        maxLength={1000}
        value={form.evidence}
        onChange={set('evidence')}
      />
      <div className="flex gap-2">
        <button className="secondary !min-h-10 text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className="primary !min-h-10 flex-1 text-sm"
          disabled={busy || !form.contact.trim() || (!form.mail.trim() && !form.tel.trim())}
          onClick={async () => {
            setBusy(true)
            try {
              await claimRestaurant(supabase, restaurantId, form)
              track('claim_sent')
              setSent(true)
            } catch (error: any) {
              toast.error(error?.message || 'Could not send that')
            } finally {
              setBusy(false)
            }
          }}
        >
          Send claim
        </button>
      </div>
    </div>
  )
}

/** "Restaurant owner" on a person — never says which restaurant. */
export function OwnerTag() {
  return (
    <span className="owner-tag" title="Runs a restaurant on Crumbs">
      <BadgeCheck size={14} aria-hidden="true" />
      Restaurant owner
    </span>
  )
}
