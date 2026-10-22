'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import type { Place, Status } from '@/hooks/use-crumbs-data'
import { placeAverage } from './place-card'
function FitBounds({ places }: { places: Place[] }) {
  const map = useMap()
  useEffect(() => {
    const located = places.filter((place) => place.latitude !== null && place.longitude !== null)
    if (!map || !located.length) return
    const bounds = new (globalThis as any).google.maps.LatLngBounds()
    located.forEach((place) => bounds.extend({ lat: place.latitude!, lng: place.longitude! }))
    map.fitBounds(bounds, 64)
  }, [map, places])
  return null
}
function Recenter({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !target) return
    map.panTo(target)
    map.setZoom(14)
  }, [map, target])
  return null
}

export function MapTab({
  places,
  apiKey,
  onSelect,
}: {
  places: Place[]
  apiKey?: string
  onSelect: (place: Place) => void
}) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'All' | Status | 'Pinned'>('All')
  const [location, setLocation] = useState({ lat: 20, lng: 0 })
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number } | null>(null)
  const filtered = useMemo(
    () =>
      places.filter(
        (place) =>
          filter === 'All' || (filter === 'Pinned' ? place.pinned : place.status === filter),
      ),
    [filter, places],
  )
  const preview = filtered.find((place) => place.id === previewId) ?? null
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((position) =>
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
    )
  }, [])
  if (!apiKey)
    return (
      <div className="empty">
        <MapPin className="mx-auto text-primary" />
        <h2 className="mt-3 font-serif text-2xl font-bold">Your map is ready when you are</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show live Google Maps.
        </p>
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      {places.some((place) => place.latitude === null) && (
        <p className="surface-soft text-sm">
          📍 {places.filter((place) => place.latitude === null).length} saved place(s) have no map
          pin. Open one and tap <strong>Find on Google</strong>.
        </p>
      )}
      <div className="relative overflow-hidden rounded-[28px]">
        <div className="chip-row absolute left-3 right-3 top-3 z-10">
          {['All', 'Been', 'Want to try', 'Pinned'].map((item) => (
            <button
              key={item}
              aria-pressed={filter === item}
              className={`chip ${filter === item ? 'chip-active' : ''}`}
              onClick={() => setFilter(item as typeof filter)}
            >
              {item}
            </button>
          ))}
        </div>
        <Map
          mapId="DEMO_MAP_ID"
          onClick={() => setPreviewId(null)}
          gestureHandling="greedy"
          disableDefaultUI
          defaultCenter={location}
          defaultZoom={2}
          className="h-[calc(100dvh-230px)] min-h-[520px] w-full"
        >
          <FitBounds places={filtered} />
          <Recenter target={locateTarget} />
          {filtered
            .filter((place) => place.latitude !== null && place.longitude !== null)
            .map((place) => (
              <AdvancedMarker
                key={place.id}
                position={{ lat: place.latitude!, lng: place.longitude! }}
                onClick={() => setPreviewId(place.id)}
              >
                <div
                  className={`marker ${place.status === 'Been' ? 'marker-been' : 'marker-want'}`}
                >
                  {placeAverage(place) ? placeAverage(place).toFixed(1) : '+'}
                </div>
              </AdvancedMarker>
            ))}
        </Map>

        {preview && (
          <div className="surface absolute bottom-4 left-3 right-16 z-10 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-serif text-xl font-bold">{preview.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    preview.status,
                    preview.cuisine,
                    preview.price_level ? '$'.repeat(preview.price_level) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <strong className="font-serif text-2xl text-primary">
                {placeAverage(preview) ? placeAverage(preview).toFixed(1) : '—'}
              </strong>
            </div>
            <div className="flex gap-2">
              <button
                className="primary !min-h-10 flex-1 !px-3 text-sm"
                onClick={() => onSelect(preview)}
              >
                Details
              </button>
              <a
                className="secondary !min-h-10 flex-1 !px-3 text-sm"
                target="_blank"
                rel="noreferrer"
                href={
                  preview.google_maps_url ||
                  `https://www.google.com/maps/dir/?api=1&destination=${preview.latitude},${preview.longitude}`
                }
              >
                Directions
              </a>
              <button
                className="icon-btn !h-10 !w-10"
                aria-label="Close preview"
                onClick={() => setPreviewId(null)}
              >
                ×
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          aria-label="Locate me"
          className="icon-btn absolute bottom-4 right-4 z-10"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (position) =>
                setLocateTarget({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                }),
              () => {},
            )
          }
        >
          <LocateFixed />
        </button>
      </div>
    </div>
  )
}
