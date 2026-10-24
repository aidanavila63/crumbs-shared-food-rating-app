'use client'
import { useShowScore } from './score-input'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, SlidersHorizontal, Telescope, X } from 'lucide-react'
import { toast } from 'sonner'
import { notYetSaved, type FoundSpot } from '@/lib/add-found'
import { distanceKm } from '@/lib/stats'
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import type { Place, Status } from '@/hooks/use-crumbs-data'
import { placeAverage } from './place-card'
import { OsmMap } from './osm-map'
import { markGoogleDown, useGoogleDown } from '@/lib/google-status'
import { heatSpots, markerClass, type PinMode } from '@/lib/place-info'
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
/** #26 dashed walking line for a food crawl (Google map). */
function RouteLine({ route }: { route: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    const g = (globalThis as any).google
    if (!map || !g || route.length < 2) return
    const line = new g.maps.Polyline({
      path: route,
      map,
      strokeOpacity: 0,
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: '#7b2d5b', scale: 4 },
          offset: '0',
          repeat: '16px',
        },
      ],
    })
    return () => line.setMap(null)
  }, [map, route])
  return null
}
/** #24 heatmap on the Google map: warm circles (Google's own heatmap layer is retired). */
function HeatCircles({ places, onPick }: { places: Place[]; onPick: (id: string) => void }) {
  const map = useMap()
  useEffect(() => {
    const g = (globalThis as any).google
    if (!map || !g) return
    const circles = heatSpots(places).map((spot) => {
      const circle = new g.maps.Circle({
        map,
        center: { lat: spot.lat, lng: spot.lng },
        radius: spot.radius,
        strokeWeight: 0,
        fillColor: '#d9541c',
        fillOpacity: spot.opacity,
        clickable: true,
      })
      circle.addListener('click', () => onPick(spot.id))
      return circle
    })
    return () => circles.forEach((circle: any) => circle.setMap(null))
  }, [map, places, onPick])
  return null
}
/** Lets the Explore button ask the Google map where it's looking. */
function CenterProbe({ onProbe }: { onProbe: (probe: () => { lat: number; lng: number } | null) => void }) {
  const map = useMap()
  useEffect(() => {
    onProbe(() => map?.getCenter()?.toJSON() ?? null)
  }, [map, onProbe])
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
  route = [],
  labels = {},
  demo = false,
  onAddFound,
}: {
  demo?: boolean
  /** #36 Explore: save an OpenStreetMap spot to Want to try */
  onAddFound?: (spot: FoundSpot) => Promise<boolean>
  route?: { lat: number; lng: number }[]
  labels?: Record<string, string>
  places: Place[]
  apiKey?: string
  onSelect: (place: Place) => void
}) {
  const show = useShowScore()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'All' | Status | 'Pinned'>('All')
  // #22 extra filters + #21 pin colours (pin colours are remembered on this phone).
  const [showFilters, setShowFilters] = useState(false)
  const [heat, setHeat] = useState(false)
  // #36 Explore: everything to eat around where the map is looking, from OpenStreetMap (free).
  const [spots, setSpots] = useState<FoundSpot[] | null>(null)
  const [spotId, setSpotId] = useState<string | null>(null)
  const [exploring, setExploring] = useState(false)
  const [exploreCenter, setExploreCenter] = useState<{ lat: number; lng: number } | null>(null)
  const centerProbe = useRef<(() => { lat: number; lng: number } | null) | null>(null)
  const setProbe = useCallback((probe: () => { lat: number; lng: number } | null) => {
    centerProbe.current = probe
  }, [])
  const spot = spots?.find((s) => s.google_place_id === spotId) ?? null
  async function explore() {
    haptic('tap')
    const center = centerProbe.current?.() ?? location
    setExploring(true)
    setExploreCenter(center)
    setPreviewId(null)
    try {
      let found: FoundSpot[]
      if (demo)
        found = [
          ['Golden Dumpling', 'Chinese', 0.003, 0.002],
          ['Café Luna', 'Coffee Shop', -0.002, 0.004],
          ['Smash Burger Co', 'Burger', 0.004, -0.003],
        ].map(([name, cuisine, dLat, dLng], i) => ({
          google_place_id: `osm:N${900 + i}`,
          name: name as string,
          cuisine: cuisine as string,
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
        const response = await fetch(url)
        const json = await response.json()
        if (!response.ok) throw new Error(json.error)
        found = json.results ?? []
      }
      const fresh = notYetSaved(found, places)
      setSpots(fresh)
      if (!fresh.length) toast('Nothing new to eat around here on OpenStreetMap')
    } catch (error: any) {
      toast.error(error?.message || 'Could not explore right now')
    } finally {
      setExploring(false)
    }
  }
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
  const extraCount = (minRating ? 1 : 0) + (prices.length ? 1 : 0) + (cuisine ? 1 : 0) + (heat ? 1 : 0)
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
        {heat && !showFilters && (
          <p className="heat-legend absolute bottom-3 left-3 z-10">🔥 Bigger, darker = more visits</p>
        )}
        {showFilters && (
          <div className="surface map-filters absolute left-3 right-3 top-16 z-20 flex flex-col gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Show</p>
              <div className="chip-row mt-1">
                {[
                  [false, '📍 Pins'],
                  [true, '🔥 Where we eat most'],
                ].map(([value, label]) => (
                  <button
                    key={String(value)}
                    aria-pressed={heat === value}
                    className={`chip chip-sm ${heat === value ? 'chip-active' : ''}`}
                    onClick={() => {
                      haptic('select')
                      setHeat(value as boolean)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
            route={route}
            labels={labels}
            heat={heat}
            spots={spots ?? []}
            onSpot={(id) => {
              setPreviewId(null)
              setSpotId(id)
            }}
            onProbe={setProbe}
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
              <RouteLine route={route} />
              <CenterProbe onProbe={setProbe} />
              {(spots ?? []).map((s) => (
                <AdvancedMarker
                  key={s.google_place_id}
                  position={{ lat: s.latitude, lng: s.longitude }}
                  onClick={() => {
                    setPreviewId(null)
                    setSpotId(s.google_place_id)
                  }}
                >
                  <div className={`marker marker-ghost ${spotId === s.google_place_id ? 'marker-selected' : ''}`}>+</div>
                </AdvancedMarker>
              ))}
              {heat && <HeatCircles places={filtered} onPick={setPreviewId} />}
              {!heat &&
                filtered
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
                      {labels[place.id] ?? (placeAverage(place) ? show(placeAverage(place)) : '+')}
                    </div>
                  </AdvancedMarker>
                ))}
            </Map>
          </>
        )}

        {spots && (
          <button
            type="button"
            className="chip chip-sm chip-active absolute right-3 top-16 z-10"
            aria-label="Stop exploring"
            onClick={() => {
              setSpots(null)
              setSpotId(null)
            }}
          >
            🔭 {spots.length} new spot{spots.length === 1 ? '' : 's'} <X size={14} className="ml-1" />
          </button>
        )}
        {spot && !preview && (
          <div
            key={spot.google_place_id}
            className="surface preview-pop absolute bottom-4 left-3 right-16 z-10 flex flex-col gap-2"
          >
            <div>
              <p className="tag mb-1 w-fit">New to you</p>
              <p className="font-serif text-xl font-bold">{spot.name}</p>
              <p className="text-xs text-muted-foreground">
                {[
                  spot.cuisine,
                  spot.formatted_address,
                  exploreCenter &&
                    (() => {
                      const km = distanceKm(exploreCenter, { lat: spot.latitude, lng: spot.longitude })
                      return km < 1 ? `${Math.round(km * 100) * 10} m from the map centre` : `${km.toFixed(1)} km from the map centre`
                    })(),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="primary !min-h-10 flex-1 !px-3 text-sm"
                disabled={!onAddFound}
                onClick={async () => {
                  if (!onAddFound || !(await onAddFound(spot))) return
                  setSpots((current) => current?.filter((s) => s.google_place_id !== spot.google_place_id) ?? null)
                  setSpotId(null)
                }}
              >
                + Want to try
              </button>
              <a
                className="secondary !min-h-10 !px-3 text-sm"
                target="_blank"
                rel="noreferrer"
                href={
                  spot.google_maps_url ||
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.latitude},${spot.longitude}`)}`
                }
              >
                Look
              </a>
              <button className="icon-btn !h-10 !w-10" aria-label="Close" onClick={() => setSpotId(null)}>
                ×
              </button>
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">From OpenStreetMap contributors</p>
          </div>
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
          aria-label="Explore places to eat around here"
          className="icon-btn explore-btn absolute bottom-20 right-4 z-10"
          disabled={exploring}
          onClick={explore}
        >
          <Telescope size={20} className={exploring ? 'animate-pulse' : ''} />
        </button>
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
