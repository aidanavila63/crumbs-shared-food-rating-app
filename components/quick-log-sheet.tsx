'use client'
import { useMemo, useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Place, PlaceVisit, Profile, VisitKind } from '@/hooks/use-crumbs-data'
import { fromInput, inputValue, type Scale } from '@/lib/ratings'
import { ScoreInput } from './score-input'
import { KINDS, OCCASIONS } from './visits-panel'
import { distanceKm } from '@/lib/stats'
import { useUserLocation } from '@/lib/use-user-location'
import { haptic } from '@/lib/motion'
import { Sheet } from './sheet'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const away = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)

/**
 * #72 Quick log: "we're eating here" in about 10 seconds.
 * Pick the place (closest first when location is allowed), tap stars, done.
 * Logs a visit for today, marks the place Been, and saves your rating.
 */
export function QuickLogSheet({
  places,
  userId,
  demo,
  supabase,
  onUpdate,
  onAddNew,
  onClose,
  v4 = false,
  scale = '5',
  members = [],
  turns = false,
  onCookedAtHome,
}: {
  v4?: boolean
  scale?: Scale
  members?: Profile[]
  turns?: boolean
  /** #77 jump to Home cooking instead */
  onCookedAtHome?: () => void
  places: Place[]
  userId: string
  demo: boolean
  supabase: any
  onUpdate: (place: Place) => void
  onAddNew: () => void
  onClose: () => void
}) {
  const here = useUserLocation(true)
  const [query, setQuery] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = places.find((place) => place.id === pickedId) ?? null
  const mine = picked?.place_ratings.find((rating) => rating.user_id === userId)
  const [score, setScore] = useState(0)
  const [spend, setSpend] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<VisitKind>('dine_in')
  const [people, setPeople] = useState('')
  const [pickedBy, setPickedBy] = useState('')
  const [occasion, setOccasion] = useState<'date' | 'celebration' | null>(null)

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return places
      .filter((place) =>
        `${place.name} ${place.cuisine ?? ''} ${place.formatted_address ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
      .map((place) => ({
        place,
        km:
          here && place.latitude !== null && place.longitude !== null
            ? distanceKm(here, { lat: place.latitude, lng: place.longitude })
            : null,
      }))
      .sort((a, b) => {
        if (a.km !== null && b.km !== null) return a.km - b.km
        if (a.km !== null) return -1
        if (b.km !== null) return 1
        // No location: want-to-try first (you're probably crossing one off), then newest.
        if (a.place.status !== b.place.status) return a.place.status === 'Want to try' ? -1 : 1
        return b.place.created_at.localeCompare(a.place.created_at)
      })
      .slice(0, 8)
  }, [places, query, here])

  function pick(place: Place) {
    haptic('select')
    setPickedId(place.id)
    setScore(
      inputValue(
        place.place_ratings.find((rating) => rating.user_id === userId),
        scale,
      ),
    )
  }

  async function log() {
    if (!picked) return
    const amount = spend.trim() ? Number(spend.replace(/[^0-9.]/g, '')) : null
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000))
      return toast.error('That amount looks off')
    const heads = people ? Number(people) : null
    if (heads !== null && (heads < 1 || heads > 50)) return toast.error('How many people? (1-50)')
    setBusy(true)
    const date = todayIso()
    const saved = score ? (scale === '5' ? { score, points: null } : fromInput(score, scale)) : null
    const extra = v4
      ? {
          kind,
          people: heads,
          picked_by: pickedBy || null,
          occasion,
          score: saved ? (saved.points ?? saved.score * 20) / 20 : null,
        }
      : {}
    try {
      let visit: PlaceVisit = {
        id: crypto.randomUUID(),
        place_id: picked.id,
        visited_on: date,
        spend: amount,
        created_by: userId,
        ...extra,
      }
      if (!demo) {
        const { data, error } = await supabase
          .from('place_visits')
          .insert({
            place_id: picked.id,
            visited_on: date,
            spend: amount,
            created_by: userId,
            ...extra,
          })
          .select('*')
          .single()
        if (error) throw error
        visit = data
        const placeChanges = { status: 'Been', visited_on: date }
        const { error: placeError } = await supabase
          .from('places')
          .update(placeChanges)
          .eq('id', picked.id)
        if (placeError) throw placeError
        if (saved) {
          const { error: ratingError } = await supabase.from('place_ratings').upsert({
            place_id: picked.id,
            user_id: userId,
            score: saved.score,
            notes: mine?.notes ?? null,
            ...(v4 ? { points: saved.points } : {}),
          })
          if (ratingError) throw ratingError
        }
      }
      onUpdate({
        ...picked,
        status: 'Been',
        visited_on: date,
        place_visits: [...(picked.place_visits ?? []), visit],
        place_ratings: saved
          ? [
              ...picked.place_ratings.filter((rating) => rating.user_id !== userId),
              {
                ...(mine ?? {}),
                user_id: userId,
                score: saved.score,
                points: saved.points,
                notes: mine?.notes ?? null,
              },
            ]
          : picked.place_ratings,
      })
      haptic('success')
      toast.success(`Logged ${picked.name}`)
      onClose()
    } catch (error: any) {
      toast.error(error?.message || 'Could not log that visit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet label="Quick log" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Quick log</p>
          <h2 className="font-serif text-3xl font-bold">
            {picked ? picked.name : 'Where are you eating?'}
          </h2>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {!picked ? (
        <div className="stagger mt-4 flex flex-col gap-2">
          <input
            className="field"
            aria-label="Find one of your places"
            placeholder="Find one of your places"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {options.map(({ place, km }) => (
            <button
              key={place.id}
              className="surface-soft flex items-center justify-between gap-3 text-left"
              onClick={() => pick(place)}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{place.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[place.status, place.cuisine].filter(Boolean).join(' · ')}
                </span>
              </span>
              {km !== null && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <MapPin size={12} /> {away(km)}
                </span>
              )}
            </button>
          ))}
          {!options.length && (
            <p className="text-sm text-muted-foreground">No places match that.</p>
          )}
          <button className="secondary mt-1" onClick={onAddNew}>
            <Plus size={18} /> Somewhere new
          </button>
          {onCookedAtHome && (
            <button
              className="text-sm font-semibold text-primary underline"
              onClick={onCookedAtHome}
            >
              🏠 Cooked at home instead?
            </button>
          )}
        </div>
      ) : (
        <div className="stagger mt-4 flex flex-col gap-4">
          <div className="surface flex flex-col items-center gap-1">
            <p className="text-sm text-muted-foreground">How was it?</p>
            <div className="quick-stars">
              <ScoreInput value={score} scale={scale} onChange={setScore} />
            </div>
            <p className="text-xs text-muted-foreground">Optional — you can rate later.</p>
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Spent (optional)
            <input
              className="field"
              inputMode="decimal"
              placeholder="$"
              value={spend}
              onChange={(event) => setSpend(event.target.value)}
            />
          </label>
          {v4 && (
            <div className="flex flex-col gap-3">
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
              <div className="flex items-center gap-2">
                <input
                  className="field !w-24"
                  aria-label="How many people"
                  inputMode="numeric"
                  placeholder="People"
                  value={people}
                  onChange={(event) => setPeople(event.target.value.replace(/\D/g, '').slice(0, 2))}
                />
                {turns && members.length > 1 && (
                  <select
                    className="field !w-auto min-w-0 flex-1"
                    aria-label="Who picked this place"
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
            </div>
          )}
          <button className="primary" disabled={busy} onClick={log}>
            {busy ? 'Logging…' : 'Log it — today'}
          </button>
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => setPickedId(null)}
          >
            Pick a different place
          </button>
        </div>
      )}
    </Sheet>
  )
}
