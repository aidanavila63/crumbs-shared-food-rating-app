'use client'
import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { useUserLocation } from '@/lib/use-user-location'

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

type Suggestion = { id: string; main: string; secondary: string; prediction: any }

/** Text input with Google Places (New) autocomplete. Falls back to a plain input without Maps. */
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
  const [results, setResults] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const token = useRef<any>(null)
  const skip = useRef(false)

  useEffect(() => {
    if (skip.current) {
      skip.current = false
      return
    }
    if (!places || value.trim().length < 3) {
      setResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        token.current ??= new places.AutocompleteSessionToken()
        const request: any = { input: value.trim(), sessionToken: token.current }
        if (location) {
          request.origin = location
          request.locationBias = { center: location, radius: 30000 }
        }
        const { suggestions } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
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
        if (!cancelled) setResults([])
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [places, value, location])

  async function pick(item: Suggestion) {
    setLoading(true)
    try {
      const place = item.prediction.toPlace()
      await place.fetchFields({ fields: FIELDS })
      token.current = null // a pick ends the billing session
      skip.current = true
      setResults([])
      const found = toFoundPlace(place)
      onChange(found.name)
      onPick(found)
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
export async function findOnGoogle(places: any, query: string): Promise<FoundPlace | null> {
  const { places: found } = await places.Place.searchByText({
    textQuery: query,
    fields: FIELDS,
    maxResultCount: 1,
  })
  return found?.[0] ? toFoundPlace(found[0]) : null
}
