'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Place, Status } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'
import { PlaceSearch, type FoundPlace } from './place-search'
export function AddPlaceSheet({
  userId,
  groupId,
  demo,
  onClose,
  onSaved,
  supabase,
}: {
  userId?: string
  groupId?: string
  demo: boolean
  onClose: () => void
  onSaved: (place: Place) => void
  supabase: any
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState<Status>('Want to try')
  const [score, setScore] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [found, setFound] = useState<FoundPlace | null>(null)
  async function save() {
    if (!name.trim()) return toast.error('Add a restaurant name first')
    setSaving(true)
    try {
      if (demo) {
        onSaved({
          id: crypto.randomUUID(),
          group_id: groupId!,
          name: name.trim(),
          formatted_address: found?.formatted_address ?? (address || null),
          latitude: found?.latitude ?? null,
          longitude: found?.longitude ?? null,
          google_place_id: found?.google_place_id ?? `manual:${crypto.randomUUID()}`,
          price_level: found?.price_level ?? null,
          cuisine: found?.cuisine ?? null,
          website: found?.website ?? null,
          google_maps_url: found?.google_maps_url ?? null,
          status,
          pinned: false,
          tags: [],
          created_at: new Date().toISOString(),
          place_ratings: score ? [{ user_id: userId!, score, notes }] : [],
          dishes: [],
        })
      } else {
        const { data, error } = await supabase
          .from('places')
          .insert({
            group_id: groupId,
            created_by: userId,
            name: name.trim(),
            formatted_address: found?.formatted_address ?? (address.trim() || null),
            latitude: found?.latitude ?? null,
            longitude: found?.longitude ?? null,
            price_level: found?.price_level ?? null,
            cuisine: found?.cuisine ?? null,
            website: found?.website ?? null,
            google_maps_url: found?.google_maps_url ?? null,
            google_place_id: found?.google_place_id ?? `manual:${crypto.randomUUID()}`,
            status,
            pinned: false,
            tags: [],
          })
          .select(
            '*,place_ratings(score,user_id,notes),dishes(*,dish_ratings(score,user_id,notes))',
          )
          .single()
        if (error) throw error
        if (score && data) {
          const rating = await supabase
            .from('place_ratings')
            .upsert({ place_id: data.id, user_id: userId, score, notes })
          if (rating.error) throw rating.error
        }
        onSaved(data)
      }
      toast.success('Place added')
      onClose()
    } catch (error: any) {
      toast.error(
        error.code === '23505'
          ? 'That place is already on your list'
          : error.message || 'Could not add place',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="sheet">
        <div className="sheet-handle" />
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold">Add a place</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <PlaceSearch
            autoFocus
            value={name}
            onChange={(text) => {
              setName(text)
              if (found && text !== found.name) setFound(null)
            }}
            onPick={(place) => {
              setFound(place)
              setAddress(place.formatted_address ?? '')
            }}
            placeholder="Search for a restaurant"
          />
          {found ? (
            <p className="surface-soft text-sm">
              📍 {found.formatted_address}
              {found.cuisine ? ` · ${found.cuisine}` : ''}
            </p>
          ) : (
            <>
              <input
                className="field"
                placeholder="Address (optional)"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pick a search result to put it on the map. Places typed by hand are saved without a
                map pin.
              </p>
            </>
          )}
          <div className="chip-row">
            {(['Been', 'Want to try'] as Status[]).map((item) => (
              <button
                className={`chip ${status === item ? 'chip-active' : ''}`}
                key={item}
                onClick={() => setStatus(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {status === 'Been' && (
            <>
              <RatingStars value={score} onChange={setScore} label="Quick rating" />
              <textarea
                className="field min-h-24"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </>
          )}
          <button className="primary mt-2 w-full" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save place'}
          </button>
        </div>
      </section>
    </div>
  )
}
