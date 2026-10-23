'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { useUserLocation } from '@/lib/use-user-location'
import { markGoogleDown, useGoogleDown } from '@/lib/google-status'

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
}

// Only these fields are requested, to stay inside the cheap Places tiers.
const FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'priceLevel',
  'websiteURI',
  'googleMapsURI',
  'primaryType',
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
  }
}

type Suggestion = {
  id: string
  main: string
  secondary: string
  prediction?: any
  osm?: FoundPlace
}

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
}: {
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
      return
    }
    let cancelled = false
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
      if (item.osm) {
        found = await enrichOsm(item.osm)
      } else {
        const place = item.prediction.toPlace()
        await place.fetchFields({ fields: FIELDS })
        token.current = null // a pick ends the billing session
        found = toFoundPlace(place)
      }
      setResults([])
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
      {results.length > 0 && (
        <div className="suggestions" role="listbox">
          {results.map((item) => (
            <button key={item.id} type="button" onClick={() => pick(item)}>
              <span className="font-semibold">{item.main}</span>
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
): Promise<FoundPlace | null> {
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
