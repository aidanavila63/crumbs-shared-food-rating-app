'use client'
import { useEffect, useState } from 'react'

export type LatLng = { lat: number; lng: number }
let cached: LatLng | null = null

export function useUserLocation(enabled = true) {
  const [location, setLocation] = useState<LatLng | null>(cached)
  useEffect(() => {
    if (!enabled || cached || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        cached = { lat: position.coords.latitude, lng: position.coords.longitude }
        setLocation(cached)
      },
      () => {},
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    )
  }, [enabled])
  return location
}
