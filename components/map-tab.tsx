'use client'
import { useShowScore } from './score-input'
import { useEffect, useMemo, useState } from 'react'
import { LocateFixed, MapPin, SlidersHorizontal } from 'lucide-react'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import type { Place, Status } from '@/hooks/use-crumbs-data'
import { placeAverage } from './place-card'
import { OsmMap } from './osm-map'
import { markGoogleDown, useGoogleDown } from '@/lib/google-status'
import { markerClass, type PinMode } from '@/lib/place-info'
import { haptic } from '@/lib/motion'
function FitBounds({ places }: { places: Place[] }) {
  const map = useMap()
  const located = places.filter((place) => place.latitude !== null && place.longitude !== null)
  // Only re-fit when the pins themselves change, not on every data reload (which would
  // yank the view back while someone is panning or zooming).
  const key = located.map((place) => `${place.id}:${place.latitude},${place.longitude}`).join('|')
  useEffect(() => {
    if (!map || !located.length) return
    const bounds = new (globalThis as any).google.maps.LatLngBounds()
    located.forEach((place) => bounds.extend({ lat: place.latitude!, lng: place.longitude! }))
    map.fitBounds(bounds, 64)
    if (located.length === 1) {
      // fitBounds on one point zooms to rooftop level; back off to a neighbourhood view
      const listener = map.addListener('idle', () => {
        if ((map.getZoom() ?? 0) > 15) map.setZoom(15)
        listener.remove()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
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
  const show = useShowScore()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'All' | Status | 'Pinned'>('All')
  // #22 extra filters + #21 pin colours (pin colours are remembered on this phone).
  const [showFilters, setShowFilters] = useState(false)
  const [minRating, setMinRating] = useState(0)
  const [prices, setPrices] = useState<number[]>([])
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [pinMode, setPinModeState] = useState<PinMode>(() => {
    try {
      return localStorage.getItem('crumbs-pin-mode') === 'status' ? 'status' : 'rating'
    } catch {
      return 'rating'
    }
  })
  function setPinMode(mode: PinMode) {
    setPinModeState(mode)
    try {
      localStorage.setItem('crumbs-pin-mode', mode)
    } catch {}
  }
  const cuisines = useMemo(
    () => [...new Set(places.map((place) => place.cuisine).filter((c): c is string => !!c))].sort(),
    [places],
  )
  const extraCount = (minRating ? 1 : 0) + (prices.length ? 1 : 0) + (cuisine ? 1 : 0)
  const [location, setLocation] = useState({ lat: 20, lng: 0 })
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number } | null>(null)
  const filtered = useMemo(
    () =>
      places.filter(
        (place) =>
          (filter === 'All' || (filter === 'Pinned' ? place.pinned : place.status === filter)) &&
          (!minRating || placeAverage(place) >= minRating) &&
          (!prices.length || (place.price_level !== null && prices.includes(place.price_level))) &&
          (!cuisine || place.cuisine === cuisine),
      ),
    [filter, places, minRating, prices, cuisine],
  )
  const preview = filtered.find((place) => place.id === previewId) ?? null
  const googleDown = useGoogleDown()
  const [chooseOsm, setChooseOsm] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  useEffect(() => {
    try {
      setChooseOsm(localStorage.getItem('crumbs-map') === 'osm')
    } catch {}
  }, [])
  // If Google's map hasn't drawn after a while, treat it as unavailable (e.g. daily quota hit).
  useEffect(() => {
    if (!apiKey || googleReady || chooseOsm || googleDown) return
    const timer = setTimeout(() => markGoogleDown(), 12000)
    return () => clearTimeout(timer)
  }, [apiKey, googleReady, chooseOsm, googleDown])
  const useOsm = chooseOsm || googleDown || !apiKey
  function pickProvider(osm: boolean) {
    setChooseOsm(osm)
    try {
      localStorage.setItem('crumbs-map', osm ? 'osm' : 'google')
    } catch {}
  }
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((position) =>
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
    )
  }, [])
  return (
    <div className="flex flex-col gap-3">
      {places.some((place) => place.latitude === null) && (
        <p className="surface-soft text-sm">
          📍 {places.filter((place) => place.latitude === null).length} saved place(s) have no map
          pin. Open one and tap <strong>Find on map</strong>.
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
          <button
            aria-pressed={showFilters}
            aria-label="More filters and pin colours"
            className={`chip ${showFilters || extraCount ? 'chip-active' : ''}`}
            onClick={() => {
              haptic('tap')
              setShowFilters(!showFilters)
            }}
          >
            <SlidersHorizontal size={16} />
            {extraCount ? <span className="ml-1">{extraCount}</span> : null}
          </button>
        </div>
        {showFilters && (
          <div className="surface map-filters absolute left-3 right-3 top-16 z-20 flex flex-col gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Rating
              </p>
              <div className="chip-row mt-1">
                {[0, 3, 4, 4.5].map((value) => (
                  <button
                    key={value}
                    aria-pressed={minRating === value}
                    className={`chip chip-sm ${minRating === value ? 'chip-active' : ''}`}
                    onClick={() => setMinRating(value)}
                  >
                    {value ? `${value}★+` : 'Any'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Price
              </p>
              <div className="chip-row mt-1">
                {[1, 2, 3, 4].map((level) => (
                  <button
                    key={level}
                    aria-pressed={prices.includes(level)}
                    className={`chip chip-sm ${prices.includes(level) ? 'chip-active' : ''}`}
                    onClick={() =>
                      setPrices(
                        prices.includes(level)
                          ? prices.filter((p) => p !== level)
                          : [...prices, level],
                      )
                    }
                  >
                    {'$'.repeat(level)}
                  </button>
                ))}
              </div>
            </div>
            {cuisines.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Cuisine
                </p>
                <div className="chip-row mt-1">
                  <button
                    aria-pressed={!cuisine}
                    className={`chip chip-sm ${!cuisine ? 'chip-active' : ''}`}
                    onClick={() => setCuisine(null)}
                  >
                    Any
                  </button>
                  {cuisines.map((item) => (
                    <button
                      key={item}
                      aria-pressed={cuisine === item}
                      className={`chip chip-sm ${cuisine === item ? 'chip-active' : ''}`}
                      onClick={() => setCuisine(cuisine === item ? null : item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Pin colours
              </p>
              <div className="chip-row mt-1">
                {(
                  [
                    ['rating', 'By rating'],
                    ['status', 'Been / want to try'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    aria-pressed={pinMode === mode}
                    className={`chip chip-sm ${pinMode === mode ? 'chip-active' : ''}`}
                    onClick={() => setPinMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <button
                className="text-sm text-muted-foreground underline"
                onClick={() => {
                  setMinRating(0)
                  setPrices([])
                  setCuisine(null)
                }}
              >
                Clear filters
              </button>
              <button
                className="text-sm font-bold text-primary"
                onClick={() => setShowFilters(false)}
              >
                Done
              </button>
            </div>
          </div>
        )}
        {useOsm ? (
          <OsmMap
            places={filtered}
            center={location}
            locateTarget={locateTarget}
            onPick={setPreviewId}
            onBackgroundClick={() => setPreviewId(null)}
            pinMode={pinMode}
            selectedId={previewId}
          />
        ) : (
          <>
            <Map
              onTilesLoaded={() => setGoogleReady(true)}
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
                      className={`marker ${markerClass(place, placeAverage(place), pinMode)} ${previewId === place.id ? 'marker-selected' : ''}`}
                    >
                      {placeAverage(place) ? show(placeAverage(place)) : '+'}
                    </div>
                  </AdvancedMarker>
                ))}
            </Map>
          </>
        )}

        {preview && (
          <div
            key={preview.id}
            className="surface preview-pop absolute bottom-4 left-3 right-16 z-10 flex flex-col gap-2"
          >
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
                {show(placeAverage(preview))}
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
        {apiKey && (
          <button
            type="button"
            className="chip chip-sm absolute left-3 top-16 z-10"
            onClick={() => pickProvider(!chooseOsm)}
          >
            {useOsm
              ? googleDown && !chooseOsm
                ? 'OpenStreetMap (Google unavailable)'
                : 'Use Google map'
              : 'Use OpenStreetMap'}
          </button>
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
