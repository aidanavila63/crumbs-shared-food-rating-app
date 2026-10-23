'use client'
import { useEffect, useRef } from 'react'
import type { Place } from '@/hooks/use-crumbs-data'
import { placeAverage } from './place-card'
import { markerClass } from '@/lib/place-info'
import 'leaflet/dist/leaflet.css'

type Target = { lat: number; lng: number } | null

/** OpenStreetMap version of the map (Leaflet). Used when Google Maps is unavailable. */
export function OsmMap({
  places,
  center,
  locateTarget,
  onPick,
  onBackgroundClick,
}: {
  places: Place[]
  center: { lat: number; lng: number }
  locateTarget: Target
  onPick: (id: string) => void
  onBackgroundClick: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const state = useRef<{ L: any; map: any; layer: any; fitted: string } | null>(null)
  const callbacks = useRef({ onPick, onBackgroundClick })
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
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)
      map.on('click', () => callbacks.current.onBackgroundClick())
      state.current = { L, map, layer: L.layerGroup().addTo(map), fitted: '' }
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
    const located = places.filter((place) => place.latitude !== null && place.longitude !== null)
    located.forEach((place) => {
      const average = placeAverage(place)
      const icon = L.divIcon({
        className: '',
        html: `<div class="marker ${markerClass(place, average)}">${
          average ? average.toFixed(1) : '+'
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

  useEffect(draw, [places])

  useEffect(() => {
    if (locateTarget) state.current?.map.setView([locateTarget.lat, locateTarget.lng], 14)
  }, [locateTarget])

  return <div ref={box} className="h-[calc(100dvh-230px)] min-h-[520px] w-full" />
}
