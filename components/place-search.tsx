'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { useUserLocation } from '@/lib/use-user-location'
import { markGoogleDown, useGoogleDown } from '@/lib/google-status'
import { hoursFromGoogle, type Hours } from '@/lib/place-info'
import { findRestaurant, searchRestaurants, type Restaurant } from '@/lib/restaurants'
import { allowanceMessage, takeAllowance } from '@/lib/allowance'

export type FoundPlace = {
  google_place_id: string
  name: string
  formatted_address: string | null
  latitude: number | null
  longitude: number | null
  price_level: number | null
  cuisine: string | null
  website: string | null
  google_maps_url: string | null
  /** Filled when the place came from Google (same request, so no second lookup later). */
  opening_hours?: Hours | null
  business_status?: string | null
  hours_checked_at?: string | null
}

// One request gets everything. priceLevel + websiteURI already put this in Google's
// "Enterprise" tier (1,000 free a month), and a request is billed once at its highest tier,
// so adding the opening hours here is free — and saves the separate hours lookup that used
// to happen the first time a place was opened.
const FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'priceLevel',
  'websiteURI',
  'googleMapsURI',
  'primaryType',
  'regularOpeningHours',
  'businessStatus',
  'utcOffsetMinutes',
]

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
}

function cuisineFrom(primaryType?: string | null) {
  if (!primaryType || primaryType === 'restaurant' || primaryType === 'food') return null
  return primaryType
    .replace(/_restaurant$/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function toFoundPlace(place: any): FoundPlace {
  return {
    google_place_id: place.id,
    name: place.displayName ?? '',
    formatted_address: place.formattedAddress ?? null,
    latitude: place.location?.lat?.() ?? null,
    longitude: place.location?.lng?.() ?? null,
    price_level: place.priceLevel ? (PRICE[String(place.priceLevel)] ?? null) : null,
    cuisine: cuisineFrom(place.primaryType),
    website: place.websiteURI ?? null,
    google_maps_url: place.googleMapsURI ?? null,
    opening_hours: hoursFromGoogle(place),
    business_status: (place.businessStatus as string | null) ?? null,
    hours_checked_at: new Date().toISOString(),
  }
}

type Suggestion = {
  id: string
  main: string
  secondary: string
  prediction?: any
  osm?: FoundPlace
  /** Already on Crumbs (another group saved it): no Google lookup needed */
  crumbs?: Restaurant
}

/** A shared Crumbs restaurant, in the shape the add-place form wants. */
export function fromRestaurant(r: Restaurant): FoundPlace {
  return {
    google_place_id: r.source_key,
    name: r.name,
    formatted_address: r.formatted_address,
    latitude: r.latitude,
    longitude: r.longitude,
    price_level: r.price_level,
    cuisine: r.cuisine,
    website: r.website,
    google_maps_url: r.google_maps_url,
    opening_hours: r.opening_hours,
    business_status: r.business_status,
    hours_checked_at: r.hours_checked_at,
  }
}
// Shared details younger than this are reused instead of asking Google again.
const FRESH_DAYS = 60
const fresh = (r: Restaurant | null) =>
  !!r?.details_checked_at &&
  Date.now() - new Date(r.details_checked_at).getTime() < FRESH_DAYS * 864e5

async function searchOsm(
  query: string,
  location: { lat: number; lng: number } | null,
): Promise<FoundPlace[]> {
  const url = new URL('/api/osm/search', window.location.origin)
  url.searchParams.set('q', query)
  if (location) {
    url.searchParams.set('lat', String(location.lat))
    url.searchParams.set('lon', String(location.lng))
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error('OpenStreetMap search failed')
  return (await response.json()).results ?? []
}

/** Adds website/cuisine from OpenStreetMap when available; never fails the pick. */
async function enrichOsm(found: FoundPlace): Promise<FoundPlace> {
  const match = /^osm:([NWR])(\d+)$/.exec(found.google_place_id)
  if (!match) return found
  try {
    const response = await fetch(`/api/osm/place?type=${match[1]}&id=${match[2]}`)
    if (!response.ok) return found
    const extra = await response.json()
    return {
      ...found,
      website: extra.website ?? found.website,
      cuisine: extra.cuisine ?? found.cuisine,
    }
  } catch {
    return found
  }
}

/** Text input with Google Places (New) autocomplete. Switches to OpenStreetMap if Google fails. */
export function PlaceSearch({
  value,
  onChange,
  onPick,
  placeholder = 'Search restaurants',
  autoFocus,
  supabase,
}: {
  /** When given, Crumbs' own shared restaurants are searched first (free). */
  supabase?: any
  value: string
  onChange: (text: string) => void
  onPick: (place: FoundPlace) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const places = useMapsLibrary('places')
  const location = useUserLocation(true)
  const googleDown = useGoogleDown()
  const [waited, setWaited] = useState(false)
  const [results, setResults] = useState<Suggestion[]>([])
  const [crumbs, setCrumbs] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const token = useRef<any>(null)
  // Text we just filled in from a pick: don't search for it again.
  const skipValue = useRef<string | null>(null)
  // Google never loaded (quota, bad key, blocked): give it a few seconds, then use OpenStreetMap.
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 5000)
    return () => clearTimeout(timer)
  }, [])
  const useOsm = googleDown || (!places && waited)

  useEffect(() => {
    if (skipValue.current !== null && skipValue.current === value) return
    skipValue.current = null
    if ((!places && !useOsm) || value.trim().length < 3) {
      setResults([])
      setCrumbs([])
      return
    }
    let cancelled = false
    // #27 Places other groups already saved come first and cost nothing to pick.
    if (supabase)
      searchRestaurants(supabase, value.trim(), location).then((found) => {
        if (cancelled) return
        setCrumbs(
          found.map((r) => ({
            id: `crumbs:${r.id}`,
            main: r.name,
            secondary: r.formatted_address ?? '',
            crumbs: r,
          })),
        )
      })
    const timer = setTimeout(
      async () => {
        if (useOsm) {
          try {
            const found = await searchOsm(value.trim(), location)
            if (cancelled) return
            setResults(
              found.map((item) => ({
                id: item.google_place_id,
                main: item.name,
                secondary: item.formatted_address ?? '',
                osm: item,
              })),
            )
          } catch {
            if (!cancelled) setResults([])
          }
          return
        }
        try {
          token.current ??= new places!.AutocompleteSessionToken()
          const request: any = { input: value.trim(), sessionToken: token.current }
          if (location) {
            request.origin = location
            request.locationBias = { center: location, radius: 30000 }
          }
          const { suggestions } =
            await places!.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
          if (cancelled) return
          setResults(
            suggestions
              .filter((item: any) => item.placePrediction)
              .slice(0, 5)
              .map((item: any) => ({
                id: item.placePrediction.placeId,
                main: item.placePrediction.mainText?.text ?? item.placePrediction.text.text,
                secondary: item.placePrediction.secondaryText?.text ?? '',
                prediction: item.placePrediction,
              })),
          )
        } catch {
          if (cancelled) return
          setResults([])
          // Offline is not Google's fault; anything else (quota, key) switches to OpenStreetMap.
          if (navigator.onLine) markGoogleDown()
        }
      },
      useOsm ? 450 : 300,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [places, value, location, useOsm])

  async function pick(item: Suggestion) {
    setLoading(true)
    try {
      let found: FoundPlace
      if (item.crumbs) {
        found = fromRestaurant(item.crumbs)
      } else if (item.osm) {
        found = await enrichOsm(item.osm)
      } else {
        // Saved by another group recently? Use that copy (saves an Enterprise lookup).
        const shared = supabase ? await findRestaurant(supabase, item.prediction.placeId) : null
        if (shared && fresh(shared)) found = fromRestaurant(shared)
        else if (supabase && !(await takeAllowance(supabase, 'google')).ok) {
          // Over Crumbs' Google budget: keep the place ID (allowed forever) and take the
          // location from OpenStreetMap instead of paying for a Google lookup.
          toast(
            allowanceMessage({ ok: false, reason: 'budget_day' }, 'Google lookups') +
              ' Using OpenStreetMap.',
          )
          const osm = await findOnOsm(`${item.main} ${item.secondary}`, location).catch(() => null)
          found = {
            ...(osm ?? {
              name: item.main,
              formatted_address: item.secondary || null,
              latitude: null,
              longitude: null,
              price_level: null,
              cuisine: null,
              website: null,
              google_maps_url: null,
            }),
            name: item.main,
            google_place_id: item.prediction.placeId,
          }
        } else {
          const place = item.prediction.toPlace()
          await place.fetchFields({ fields: FIELDS })
          found = toFoundPlace(place)
        }
        token.current = null // a pick ends the session either way
      }
      setResults([])
      setCrumbs([])
      skipValue.current = found.name
      onChange(found.name)
      onPick(found)
    } catch {
      toast.error('Could not load that place. Try another result.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus={autoFocus}
        className="field"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        autoCorrect="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {useOsm && (
        <p className="text-xs text-muted-foreground">
          Google search is unavailable right now, so this is using OpenStreetMap. It may be missing
          prices and some details.
        </p>
      )}
      {loading && <p className="text-xs text-muted-foreground">Getting details…</p>}
      {results.length + crumbs.length > 0 && (
        <div className="suggestions" role="listbox">
          {[
            ...crumbs,
            ...results.filter(
              (item) =>
                !crumbs.some((c) => c.crumbs!.source_key === (item.prediction?.placeId ?? item.id)),
            ),
          ].map((item) => (
            <button key={item.id} type="button" onClick={() => pick(item)}>
              <span className="font-semibold">
                {item.main}
                {item.crumbs && <span className="tag ml-2 align-middle">On Crumbs</span>}
              </span>
              <span className="text-xs text-muted-foreground">{item.secondary}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Look up an existing manually-typed place on Google so it gets coordinates. */
export async function findOnGoogle(
  places: any,
  query: string,
  bias?: { lat: number; lng: number } | null,
  supabase?: any,
): Promise<FoundPlace | null> {
  // Over Crumbs' Google budget → null, and callers use OpenStreetMap instead.
  if (supabase && !(await takeAllowance(supabase, 'google')).ok) return null
  const request: any = { textQuery: query, fields: FIELDS, maxResultCount: 1 }
  if (bias) request.locationBias = { center: bias, radius: 500 }
  const { places: found } = await places.Place.searchByText(request)
  return found?.[0] ? toFoundPlace(found[0]) : null
}

/** Same job as findOnGoogle, but through OpenStreetMap (used when Google is unavailable). */
export async function findOnOsm(
  query: string,
  location: { lat: number; lng: number } | null,
): Promise<FoundPlace | null> {
  const [first] = await searchOsm(query, location)
  return first ? enrichOsm(first) : null
}
