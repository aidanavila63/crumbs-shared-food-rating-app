'use client'
import { useMemo, useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Place, PlaceVisit } from '@/hooks/use-crumbs-data'
import { distanceKm } from '@/lib/stats'
import { useUserLocation } from '@/lib/use-user-location'
import { haptic } from '@/lib/motion'
import { Sheet } from './sheet'
import { RatingStars } from './rating-stars'

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
}: {
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
    setScore(place.place_ratings.find((rating) => rating.user_id === userId)?.score ?? 0)
  }

  async function log() {
    if (!picked) return
    const amount = spend.trim() ? Number(spend.replace(/[^0-9.]/g, '')) : null
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000))
      return toast.error('That amount looks off')
    setBusy(true)
    const date = todayIso()
    try {
      let visit: PlaceVisit = {
        id: crypto.randomUUID(),
        place_id: picked.id,
        visited_on: date,
        spend: amount,
      }
      if (!demo) {
        const { data, error } = await supabase
          .from('place_visits')
          .insert({ place_id: picked.id, visited_on: date, spend: amount, created_by: userId })
          .select('id,place_id,visited_on,spend')
          .single()
        if (error) throw error
        visit = data
        const placeChanges = { status: 'Been', visited_on: date }
        const { error: placeError } = await supabase
          .from('places')
          .update(placeChanges)
          .eq('id', picked.id)
        if (placeError) throw placeError
        if (score) {
          const { error: ratingError } = await supabase
            .from('place_ratings')
            .upsert({ place_id: picked.id, user_id: userId, score, notes: mine?.notes ?? null })
          if (ratingError) throw ratingError
        }
      }
      onUpdate({
        ...picked,
        status: 'Been',
        visited_on: date,
        place_visits: [...(picked.place_visits ?? []), visit],
        place_ratings: score
          ? [
              ...picked.place_ratings.filter((rating) => rating.user_id !== userId),
              { user_id: userId, score, notes: mine?.notes ?? null },
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
        </div>
      ) : (
        <div className="stagger mt-4 flex flex-col gap-4">
          <div className="surface flex flex-col items-center gap-1">
            <p className="text-sm text-muted-foreground">How was it?</p>
            <div className="quick-stars">
              <RatingStars value={score} onChange={setScore} label="Your rating" />
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
