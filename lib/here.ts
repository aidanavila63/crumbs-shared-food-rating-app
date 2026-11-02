// "Are you at {place} right now?" — the map pin is one of the details Crumbs can't keep from
// Google (coordinates only 30 days), so a member standing at the door can give Crumbs its own.
// Only asked when location is already allowed and the phone is right there; never prompts.
import { distanceKm } from './stats.ts'

export type Here = { lat: number; lng: number; accuracy: number }

/** Close enough to the saved pin (and a precise enough fix) to ask about it. */
export function nearEnough(
  here: Here | null,
  place: { lat: number | null; lng: number | null },
  meters = 150,
) {
  if (!here || place.lat === null || place.lng === null) return false
  if (here.accuracy > 75) return false
  return distanceKm(here, { lat: place.lat, lng: place.lng }) * 1000 <= meters
}

/** The phone's position right now — only if the person already allowed location (no prompt). */
export async function hereNow(): Promise<Here | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions)
    return null
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (status.state !== 'granted') return null
  } catch {
    return null
  }
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 6000 },
    ),
  )
}
