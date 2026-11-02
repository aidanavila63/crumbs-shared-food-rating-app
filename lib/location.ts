'use client'
// One place that talks to the phone's location, so Crumbs asks as little as possible.
//
// - A fix is remembered on the phone (and shared by every screen) instead of each screen
//   asking for its own.
// - Background uses (search nearby first, map centre, weather) never show the permission
//   popup: they use the remembered fix, or ask the phone only if location is already allowed.
// - Only things you tap for (Locate me, Nearest, Discover nearby, Set home) may show it.
//
// iPhone home-screen apps forget "Allow" each time they're closed unless Safari's Location
// setting is "Allow", so remembering the last fix is what keeps the popup away there.
export type LatLng = { lat: number; lng: number }
type Fix = LatLng & { at: number }

const KEY = 'crumbs-last-fix'
const MIN = 60 * 1000
/** Good enough for "nearest" and discovering around you. */
export const FRESH = 15 * MIN
/** Good enough to bias search results and centre the map. */
export const ROUGH = 12 * 60 * MIN

let memory: Fix | null = null
let pending: Promise<LatLng | null> | null = null
const listeners = new Set<(fix: LatLng) => void>()

function read(): Fix | null {
  if (memory) return memory
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng) && saved.at)
      memory = saved
  } catch {}
  return memory
}

function save(lat: number, lng: number) {
  // ~100 m is plenty for food nearby, and kinder to keep on the phone.
  memory = { lat: Math.round(lat * 1e3) / 1e3, lng: Math.round(lng * 1e3) / 1e3, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {}
  listeners.forEach((fn) => fn(memory!))
  return memory
}

/** The remembered fix if it's no older than maxAge. Never touches the phone's GPS. */
export function lastFix(maxAge = FRESH): LatLng | null {
  const fix = typeof window === 'undefined' ? null : read()
  return fix && Date.now() - fix.at <= maxAge ? { lat: fix.lat, lng: fix.lng } : null
}

/** Is location already allowed? (false when unknown, e.g. older iPhones) */
export async function locationAllowed() {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return status?.state === 'granted'
  } catch {
    return false
  }
}

/**
 * Where the phone is. Uses the remembered fix when it's recent enough. With ask: false it never
 * shows the permission popup (returns null instead). Several callers at once share one request.
 */
export async function locate({
  maxAge = FRESH,
  ask = true,
  precise = false,
}: { maxAge?: number; ask?: boolean; precise?: boolean } = {}): Promise<LatLng | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  const known = lastFix(maxAge)
  if (known) return known
  if (!ask && !(await locationAllowed())) return null
  pending ??= new Promise<LatLng | null>((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(save(p.coords.latitude, p.coords.longitude)),
      () => resolve(null),
      { timeout: 10_000, maximumAge: maxAge, enableHighAccuracy: precise },
    ),
  ).finally(() => {
    pending = null
  })
  const fix = await pending
  return fix ? { lat: fix.lat, lng: fix.lng } : null
}

/** Hear about new fixes (another screen located you). Returns an unsubscribe. */
export function onFix(fn: (fix: LatLng) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** How old a remembered fix may be and still say which city you're in (for search). */
export const AREA = 30 * 24 * 60 * MIN

/**
 * Roughly where you are, for steering search results — never shows the permission popup.
 * The remembered fix (up to 30 days), then the home spot from Settings, then `fallback`
 * (e.g. the middle of your group's places). Null when there's nothing to go on.
 */
export function knownArea(fallback: LatLng | null = null): LatLng | null {
  const fix = lastFix(AREA)
  if (fix) return fix
  try {
    const home = JSON.parse(localStorage.getItem('crumbs-home') ?? 'null')
    if (home && Number.isFinite(home.lat) && Number.isFinite(home.lng))
      return { lat: home.lat, lng: home.lng }
  } catch {}
  return fallback
}

/** The middle of some places (median, so one trip abroad doesn't drag it away). */
export function middleOf(
  points: readonly { latitude?: number | null; longitude?: number | null }[],
): LatLng | null {
  const lats: number[] = []
  const lngs: number[] = []
  for (const p of points) {
    if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
      lats.push(p.latitude as number)
      lngs.push(p.longitude as number)
    }
  }
  if (!lats.length) return null
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  return { lat: median(lats), lng: median(lngs) }
}
