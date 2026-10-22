'use client'
import { useState } from 'react'
import { Pin } from 'lucide-react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import { findOnGoogle } from './place-search'

const PRICES = [1, 2, 3, 4]

export function PlaceEditor({
  place,
  supabase,
  demo,
  onUpdate,
}: {
  place: Place
  supabase: any
  demo: boolean
  onUpdate: (place: Place) => void
}) {
  const places = useMapsLibrary('places')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(place.name)
  const [address, setAddress] = useState(place.formatted_address ?? '')
  const [cuisine, setCuisine] = useState(place.cuisine ?? '')
  const [price, setPrice] = useState<number | null>(place.price_level)
  const [tags, setTags] = useState((place.tags ?? []).join(', '))
  const [busy, setBusy] = useState(false)

  async function patch(changes: Partial<Place>) {
    const next = { ...place, ...changes }
    onUpdate(next)
    if (demo) return true
    const { error } = await supabase.from('places').update(changes).eq('id', place.id)
    if (error) {
      onUpdate(place)
      toast.error(error.code === '23505' ? 'That place is already on your list' : error.message)
      return false
    }
    return true
  }

  async function save() {
    if (!name.trim()) return toast.error('A place needs a name')
    setBusy(true)
    const ok = await patch({
      name: name.trim(),
      formatted_address: address.trim() || null,
      cuisine: cuisine.trim() || null,
      price_level: price,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    })
    setBusy(false)
    if (ok) {
      toast.success('Saved')
      setOpen(false)
    }
  }

  async function locate() {
    if (!places) return toast.error('Google Maps is not loaded yet')
    setBusy(true)
    try {
      const found = await findOnGoogle(
        places,
        `${place.name} ${place.formatted_address ?? ''}`.trim(),
      )
      if (!found) return toast.error('Could not find that place on Google')
      const changes: Partial<Place> = {
        formatted_address: found.formatted_address,
        latitude: found.latitude,
        longitude: found.longitude,
        google_maps_url: found.google_maps_url,
        website: found.website,
        price_level: place.price_level ?? found.price_level,
        cuisine: place.cuisine ?? found.cuisine,
      }
      if (place.google_place_id.startsWith('manual:'))
        changes.google_place_id = found.google_place_id
      if (await patch(changes)) toast.success(`Found ${found.name} on the map`)
    } catch (error: any) {
      toast.error(error?.message || 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          aria-pressed={place.pinned}
          className={`chip ${place.pinned ? 'chip-active' : ''}`}
          onClick={() => patch({ pinned: !place.pinned })}
        >
          <Pin size={14} className="mr-1" /> {place.pinned ? 'Pinned' : 'Pin'}
        </button>
        <button className="chip" onClick={() => setOpen(!open)}>
          {open ? 'Close editor' : 'Edit details'}
        </button>
        {place.latitude === null && (
          <button className="chip chip-active" disabled={busy} onClick={locate}>
            📍 Find on Google
          </button>
        )}
      </div>
      {(place.cuisine || place.price_level) && !open && (
        <p className="text-sm text-muted-foreground">
          {[place.cuisine, place.price_level ? '$'.repeat(place.price_level) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {open && (
        <div className="surface flex flex-col gap-3">
          <input
            className="field"
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="field"
            aria-label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Address"
          />
          <input
            className="field"
            aria-label="Cuisine"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="Cuisine (e.g. Ramen)"
          />
          <div className="chip-row">
            {PRICES.map((level) => (
              <button
                key={level}
                aria-pressed={price === level}
                className={`chip ${price === level ? 'chip-active' : ''}`}
                onClick={() => setPrice(price === level ? null : level)}
              >
                {'$'.repeat(level)}
              </button>
            ))}
          </div>
          <input
            className="field"
            aria-label="Tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags, comma separated (date night, patio)"
          />
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </div>
      )}
    </div>
  )
}
