'use client'
// "Not on your list yet": places to eat around a spot (from free open map data), for anywhere you
// pick places — Plan B, crawls, lists. Loads only when you tap (each new area uses a little of the
// daily look-around allowance), and one tap saves a spot to your Want to try list.
import { useEffect, useState } from 'react'
import { Plus, RotateCw, Telescope } from 'lucide-react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { useGoogleDown } from '@/lib/google-status'
import { takeAllowance } from '@/lib/allowance'
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

// What counts as somewhere to eat or drink when asking Google.
const FOOD_TYPES = [
  'restaurant',
  'fast_food_restaurant',
  'cafe',
  'coffee_shop',
  'bakery',
  'bar',
  'pub',
  'meal_takeaway',
  'ice_cream_shop',
]

/** Backup when the free map data is down: Google's nearby search (uses the Google allowance). */
async function googleNearby(places: any, center: LatLng, supabase: any): Promise<FoundSpot[]> {
  if (!places?.Place?.searchNearby) return []
  if (supabase && !(await takeAllowance(supabase, 'google')).ok) return []
  const { places: found } = await places.Place.searchNearby({
    fields: ['id', 'displayName', 'location', 'formattedAddress', 'primaryTypeDisplayName', 'googleMapsURI'],
    locationRestriction: { center, radius: 1500 },
    includedPrimaryTypes: FOOD_TYPES,
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
  })
  return ((found ?? []) as any[])
    .filter((p) => p.location)
    .map((p) => ({
      google_place_id: p.id,
      name: p.displayName ?? 'Unnamed place',
      formatted_address: p.formattedAddress ?? null,
      latitude: p.location.lat(),
      longitude: p.location.lng(),
      cuisine: p.primaryTypeDisplayName && !/^restaurant$/i.test(p.primaryTypeDisplayName)
        ? String(p.primaryTypeDisplayName).replace(/ restaurant$/i, '')
        : null,
      website: null,
      google_maps_url: p.googleMapsURI ?? null,
    }))
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
  const [failed, setFailed] = useState<string | null>(null)
  const googlePlaces = useMapsLibrary('places')
  const googleDown = useGoogleDown()
  const [adding, setAdding] = useState<string | null>(null)
  const key = center ? `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${cuisine ?? ''}` : ''

  async function load() {
    if (!center) return
    setBusy(true)
    setFailed(null)
    try {
      let found: FoundSpot[] = []
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
        let freeError: string | null = null
        try {
          const url = new URL('/api/osm/nearby', window.location.origin)
          url.searchParams.set('lat', String(center.lat))
          url.searchParams.set('lon', String(center.lng))
          if (cuisine) url.searchParams.set('cuisine', cuisine)
          // Never spin forever: give up after 20 s.
          const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
          const json = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(json.error || 'Could not look around right now')
          found = json.results ?? []
        } catch (error: any) {
          freeError =
            error?.name === 'TimeoutError'
              ? 'The free map data took too long to answer.'
              : error?.message || 'Could not look around right now'
        }
        // Free data down or empty here: try Google once (not for cuisine look-ups).
        if ((freeError || !found.length) && !cuisine && googlePlaces && !googleDown) {
          found = await googleNearby(googlePlaces, center, supabase).catch(() => found)
        }
        if (freeError && !found.length) throw new Error(freeError)
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
      setFailed(error?.message || 'Could not look around right now')
    } finally {
      setBusy(false)
    }
  }
  // A new centre (e.g. the crawl's first stop changed) starts fresh.
  useEffect(() => {
    setSpots(null)
    setFailed(null)
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
      {spots === null && busy ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Looking around">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 !rounded-2xl" />
          ))}
        </div>
      ) : spots === null && failed ? (
        <div className="surface-soft flex flex-col gap-2 text-sm">
          <p>{failed}</p>
          <button className="secondary !min-h-10 text-sm" onClick={load}>
            <RotateCw size={16} /> Try again
          </button>
        </div>
      ) : spots === null ? (
        <button className="secondary !min-h-10 text-sm" onClick={load}>
          <Telescope size={16} /> Show places nearby
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
        <p className="text-sm text-muted-foreground">
          Nothing new to eat close by. Everything around here is already on your list.
        </p>
      )}
    </div>
  )
}
