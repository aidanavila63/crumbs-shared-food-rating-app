'use client'
// #36 "You loved X → try Y". Your own want-to-try list first (free), then a tap to look for
// new places nearby with the same cuisine on OpenStreetMap (free, no Google calls).
import { useMemo, useState } from 'react'
import { Plus, Telescope } from 'lucide-react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import { lovedToTry } from '@/lib/nearby'
import { addFoundPlace } from '@/lib/add-found'
import { average5 } from '@/lib/ratings'
import { distanceKm } from '@/lib/stats'
import { haptic } from '@/lib/motion'

type Found = {
  google_place_id: string
  name: string
  formatted_address: string | null
  latitude: number
  longitude: number
  cuisine: string | null
  website: string | null
  google_maps_url: string | null
}

const away = (km: number) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`)

export function NearbyRecs({
  places,
  groupId,
  userId,
  supabase,
  demo,
  onSelect,
  onAdded,
}: {
  places: Place[]
  groupId: string
  userId?: string
  supabase: any
  demo: boolean
  onSelect: (place: Place) => void
  onAdded: (place: Place) => void
}) {
  const recs = useMemo(() => lovedToTry(places), [places])
  const loved = useMemo(
    () =>
      places
        .filter(
          (p) =>
            p.status === 'Been' &&
            p.cuisine &&
            p.latitude !== null &&
            average5(p.place_ratings) >= 4,
        )
        .sort((a, b) => average5(b.place_ratings) - average5(a.place_ratings))
        .slice(0, 4),
    [places],
  )
  const [lookFrom, setLookFrom] = useState<string | null>(null)
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const from = loved.find((p) => p.id === lookFrom) ?? null

  async function discover(place: Place) {
    haptic('tap')
    setLookFrom(place.id)
    setFound(null)
    setBusy(true)
    try {
      let results: Found[]
      if (demo)
        results = [
          {
            google_place_id: 'osm:N1',
            name: `${place.cuisine} House`,
            formatted_address: '88 Valencia Street',
            latitude: (place.latitude ?? 0) + 0.004,
            longitude: (place.longitude ?? 0) + 0.002,
            cuisine: place.cuisine,
            website: null,
            google_maps_url: null,
          },
        ]
      else {
        const url = new URL('/api/osm/nearby', window.location.origin)
        url.searchParams.set('lat', String(place.latitude))
        url.searchParams.set('lon', String(place.longitude))
        url.searchParams.set('cuisine', place.cuisine ?? '')
        const response = await fetch(url)
        const json = await response.json()
        if (!response.ok) throw new Error(json.error)
        results = json.results ?? []
      }
      const have = new Set(places.map((p) => p.google_place_id))
      const names = new Set(places.map((p) => p.name.trim().toLowerCase()))
      setFound(
        results
          .filter((r) => !have.has(r.google_place_id) && !names.has(r.name.trim().toLowerCase()))
          .sort(
            (a, b) =>
              distanceKm(
                { lat: place.latitude!, lng: place.longitude! },
                { lat: a.latitude, lng: a.longitude },
              ) -
              distanceKm(
                { lat: place.latitude!, lng: place.longitude! },
                { lat: b.latitude, lng: b.longitude },
              ),
          )
          .slice(0, 6),
      )
    } catch (error: any) {
      toast.error(error?.message || 'Could not look nearby')
      setLookFrom(null)
    } finally {
      setBusy(false)
    }
  }

  async function add(item: Found) {
    if (!userId) return
    try {
      const place = await addFoundPlace({ supabase, demo, groupId, userId, found: item })
      haptic('success')
      setFound(
        (current) => current?.filter((f) => f.google_place_id !== item.google_place_id) ?? null,
      )
      onAdded(place)
      toast.success(`${item.name} added to Want to try`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not add that place')
    }
  }

  if (!recs.length && !loved.length) return null
  return (
    <div className="surface flex flex-col gap-3">
      <span className="tag w-fit">Because you loved…</span>
      {recs.map((rec) => (
        <div key={rec.loved.id} className="flex flex-col gap-2">
          <p className="text-sm">
            You loved <strong>{rec.loved.name}</strong> → try
          </p>
          {rec.tries.map(({ place, km }) => (
            <button
              key={place.id}
              className="surface-soft flex items-center justify-between gap-2 text-left"
              onClick={() => onSelect(place)}
            >
              <span className="min-w-0 truncate font-semibold">{place.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {km !== null ? `${away(km)} from it` : place.cuisine}
              </span>
            </button>
          ))}
        </div>
      ))}
      {loved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Find somewhere new near a favourite</p>
          <div className="chip-row">
            {loved.map((p) => (
              <button
                key={p.id}
                aria-pressed={lookFrom === p.id}
                className={`chip chip-sm ${lookFrom === p.id ? 'chip-active' : ''}`}
                disabled={busy}
                onClick={() => discover(p)}
              >
                <Telescope size={14} className="mr-1" /> {p.cuisine} near {p.name}
              </button>
            ))}
          </div>
          {busy && <div className="skeleton h-16" />}
          {from && found && (
            <div className="rise-panel flex flex-col gap-2">
              {found.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing new within 2 km. Try another favourite.
                </p>
              )}
              {found.map((item) => (
                <div
                  key={item.google_place_id}
                  className="surface-soft flex items-center justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {away(
                        distanceKm(
                          { lat: from.latitude!, lng: from.longitude! },
                          { lat: item.latitude, lng: item.longitude },
                        ),
                      )}{' '}
                      from {from.name}
                      {item.formatted_address ? ` · ${item.formatted_address}` : ''}
                    </span>
                  </span>
                  <button
                    className="primary shrink-0 !min-h-9 !px-3 text-sm"
                    aria-label={`Add ${item.name} to Want to try`}
                    onClick={() => add(item)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                © OpenStreetMap contributors. Opening hours and prices aren’t checked.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
