'use client'
import { useShowScore } from './score-input'
import { useEffect, useRef } from 'react'
import type { Place } from '@/hooks/use-crumbs-data'
import { placeAverage } from './place-card'
import { heatSpots, markerClass, type PinMode } from '@/lib/place-info'
import 'leaflet/dist/leaflet.css'

type Target = { lat: number; lng: number } | null

/** OpenStreetMap version of the map (Leaflet). Used when Google Maps is unavailable. */
export function OsmMap({
  places,
  center,
  locateTarget,
  onPick,
  onBackgroundClick,
  pinMode = 'rating',
  selectedId = null,
  route = [],
  labels = {},
  heat = false,
  spots = [],
  onSpot = () => {},
  onProbe,
}: {
  /** #36 Explore: OpenStreetMap spots you haven't saved */
  spots?: { google_place_id: string; latitude: number; longitude: number }[]
  onSpot?: (id: string) => void
  onProbe?: (probe: () => { lat: number; lng: number } | null) => void
  /** #24 show warm spots instead of pins */
  heat?: boolean
  /** Pin text override (crawl stop numbers) */
  labels?: Record<string, string>
  /** #26 crawl: dashed walking line through the stops, in order */
  route?: { lat: number; lng: number }[]
  places: Place[]
  center: { lat: number; lng: number }
  locateTarget: Target
  onPick: (id: string) => void
  onBackgroundClick: () => void
  pinMode?: PinMode
  selectedId?: string | null
}) {
  const show = useShowScore()
  const box = useRef<HTMLDivElement>(null)
  const state = useRef<{ L: any; map: any; layer: any; fitted: string; drawn?: boolean } | null>(
    null,
  )
  const callbacks = useRef({ onPick, onBackgroundClick })
  const onSpotRef = useRef(onSpot)
  onSpotRef.current = onSpot
  callbacks.current = { onPick, onBackgroundClick }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !box.current || state.current) return
      const map = L.map(box.current, { zoomControl: false, attributionControl: true }).setView(
        [center.lat, center.lng],
        2,
      )
      // Only the map data's licence credit (required); no library/brand badge.
      map.attributionControl.setPrefix(false)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)
      map.on('click', () => callbacks.current.onBackgroundClick())
      state.current = { L, map, layer: L.layerGroup().addTo(map), fitted: '' }
      onProbe?.(() => {
        const c = map.getCenter()
        return { lat: c.lat, lng: c.lng }
      })
      draw()
    })()
    return () => {
      cancelled = true
      state.current?.map.remove()
      state.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function draw() {
    const current = state.current
    if (!current) return
    const { L, map, layer } = current
    layer.clearLayers()
    // Pins drop in on the first draw only; redraws (filters, selection) shouldn't replay it.
    const still = current.drawn ? ' marker-still' : ''
    current.drawn = true
    const located = places.filter((place) => place.latitude !== null && place.longitude !== null)
    if (route.length > 1)
      L.polyline(
        route.map((p) => [p.lat, p.lng]),
        { color: '#7b2d5b', weight: 4, opacity: 0.8, dashArray: '8 10' },
      ).addTo(layer)
    if (heat) {
      heatSpots(places).forEach((spot) =>
        L.circle([spot.lat, spot.lng], {
          radius: spot.radius,
          stroke: false,
          fillColor: '#d9541c',
          fillOpacity: spot.opacity,
        })
          .on('click', (event: any) => {
            L.DomEvent.stopPropagation(event)
            callbacks.current.onPick(spot.id)
          })
          .addTo(layer),
      )
    }
    spots.forEach((spot) =>
      L.marker([spot.latitude, spot.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div class="marker marker-ghost${still}">+</div>`,
          iconSize: [34, 30],
          iconAnchor: [17, 15],
        }),
      })
        .on('click', (event: any) => {
          L.DomEvent.stopPropagation(event)
          onSpotRef.current(spot.google_place_id)
        })
        .addTo(layer),
    )
    located.forEach((place) => {
      if (heat) return
      const average = placeAverage(place)
      const icon = L.divIcon({
        className: '',
        html: `<div class="marker ${markerClass(place, average, pinMode)}${place.id === selectedId ? ' marker-selected' : ''}${still}">${
          labels[place.id] ?? (average ? show(average) : '+')
        }</div>`,
        iconSize: [44, 30],
        iconAnchor: [22, 15],
      })
      L.marker([place.latitude!, place.longitude!], { icon })
        .on('click', (event: any) => {
          L.DomEvent.stopPropagation(event)
          callbacks.current.onPick(place.id)
        })
        .addTo(layer)
    })
    // Only re-fit when the pins themselves change, not on every data reload.
    const key = located.map((place) => `${place.id}:${place.latitude},${place.longitude}`).join('|')
    if (key !== current.fitted && located.length) {
      current.fitted = key
      map.fitBounds(
        located.map((place) => [place.latitude!, place.longitude!]),
        { padding: [64, 64], maxZoom: 15 },
      )
    }
  }

  useEffect(draw, [places, pinMode, selectedId, route, labels, heat, spots])

  useEffect(() => {
    if (locateTarget) state.current?.map.setView([locateTarget.lat, locateTarget.lng], 14)
  }, [locateTarget])

  // `isolate` keeps Leaflet's own z-indexes (400-1000) inside the map so chips, cards and the tab bar stay on top.
  return <div ref={box} className="isolate map-fit w-full" />
}
