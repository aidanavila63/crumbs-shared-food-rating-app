'use client'
// "Not on your list yet": places to eat around a spot (from free open map data), for anywhere you
// pick places — Plan B, crawls, lists. Loads only when you tap (each new area uses a little of the
// daily look-around allowance), and one tap saves a spot to your Want to try list.
import { useEffect, useState } from 'react'
import { Plus, Telescope } from 'lucide-react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import { addFoundPlace, notYetSaved, type FoundSpot } from '@/lib/add-found'
import { distanceKm } from '@/lib/stats'
import { haptic } from '@/lib/motion'

type LatLng = { lat: number; lng: number }

/** The middle of some places (for "near your list"), or null when none have a pin. */
export function centreOf(places: Place[]): LatLng | null {
  const pins = places.filter((p) => p.latitude !== null && p.longitude !== null)
  if (!pins.length) return null
  return {
    lat: pins.reduce((s, p) => s + p.latitude!, 0) / pins.length,
    lng: pins.reduce((s, p) => s + p.longitude!, 0) / pins.length,
  }
}

const away = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)

export function NearbyOffList({
  center,
  near,
  cuisine,
  places,
  supabase,
  demo,
  groupId,
  userId,
  onAdded,
  addLabel = 'Add',
  max = 6,
  auto = false,
}: {
  center: LatLng | null
  /** shown in the heading ("near Hana Ramen") */
  near?: string
  cuisine?: string | null
  places: Place[]
  supabase: any
  demo: boolean
  groupId: string
  userId?: string
  /** after it's saved to the group (as Want to try) */
  onAdded: (place: Place) => void
  addLabel?: string
  max?: number
  /** load straight away instead of waiting for a tap */
  auto?: boolean
}) {
  const [spots, setSpots] = useState<FoundSpot[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const key = center ? `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${cuisine ?? ''}` : ''

  async function load() {
    if (!center) return
    setBusy(true)
    try {
      let found: FoundSpot[]
      if (demo)
        found = [
          ['Noodle Bar 88', 'Noodles', 0.002, 0.003],
          ['Little Taco Shop', 'Mexican', -0.003, 0.001],
          ['Corner Bakery', 'Bakery', 0.001, -0.004],
        ].map(([name, c, dLat, dLng], i) => ({
          google_place_id: `osm:N${700 + i}`,
          name: name as string,
          cuisine: c as string,
          formatted_address: null,
          latitude: center.lat + (dLat as number),
          longitude: center.lng + (dLng as number),
          website: null,
          google_maps_url: null,
        }))
      else {
        const url = new URL('/api/osm/nearby', window.location.origin)
        url.searchParams.set('lat', String(center.lat))
        url.searchParams.set('lon', String(center.lng))
        if (cuisine) url.searchParams.set('cuisine', cuisine)
        const response = await fetch(url)
        const json = await response.json()
        if (!response.ok) throw new Error(json.error)
        found = json.results ?? []
      }
      setSpots(
        notYetSaved(found, places)
          .sort(
            (a, b) =>
              distanceKm(center, { lat: a.latitude, lng: a.longitude }) -
              distanceKm(center, { lat: b.latitude, lng: b.longitude }),
          )
          .slice(0, max),
      )
    } catch (error: any) {
      toast.error(error?.message || 'Could not look around right now')
    } finally {
      setBusy(false)
    }
  }
  // A new centre (e.g. the crawl's first stop changed) starts fresh.
  useEffect(() => {
    setSpots(null)
    if (auto && center) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function add(spot: FoundSpot) {
    if (!userId) return
    setAdding(spot.google_place_id)
    try {
      const place = await addFoundPlace({ supabase, demo, groupId, userId, found: spot })
      haptic('success')
      setSpots((all) => all?.filter((s) => s.google_place_id !== spot.google_place_id) ?? null)
      onAdded(place)
    } catch (error: any) {
      toast.error(error?.message || 'Could not add that place')
    } finally {
      setAdding(null)
    }
  }

  if (!center) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Not on your list yet{near ? ` · near ${near}` : ''}</p>
      {spots === null ? (
        <button className="secondary !min-h-10 text-sm" disabled={busy} onClick={load}>
          <Telescope size={16} /> {busy ? 'Looking around…' : 'Show places nearby'}
        </button>
      ) : spots.length ? (
        spots.map((spot) => (
          <div key={spot.google_place_id} className="surface-soft flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{spot.name}</span>
              <span className="block text-xs text-muted-foreground">
                {[
                  spot.cuisine,
                  `${away(distanceKm(center, { lat: spot.latitude, lng: spot.longitude }))} away`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <button
              className="secondary shrink-0 !min-h-9 !px-3 text-sm"
              disabled={adding === spot.google_place_id}
              onClick={() => add(spot)}
            >
              <Plus size={14} /> {addLabel}
            </button>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Nothing new to eat close by.</p>
      )}
    </div>
  )
}
