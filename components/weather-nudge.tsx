'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Place } from '@/hooks/use-crumbs-data'
import { currentWeather, fitsNudge, weatherNudge, type Weather } from '@/lib/weather'
import { ROUGH, locate } from '@/lib/location'

export const WEATHER_KEY = 'crumbs-weather-nudges'
export const weatherNudgesOn = () => {
  try {
    return localStorage.getItem(WEATHER_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * #35 A small weather line on Decide & Plan ("🌧️ Rainy tonight — soup or ramen weather").
 * Uses your saved Home, or your location only if you've already allowed it — it never asks.
 */
export function WeatherNudge({
  places,
  home,
  onSelect,
}: {
  places: Place[]
  home: { lat: number; lng: number } | null
  onSelect: (place: Place) => void
}) {
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    if (!weatherNudgesOn()) return
    let cancelled = false
    const load = (lat: number, lng: number) =>
      currentWeather(lat, lng)
        .then((result) => !cancelled && setWeather(result))
        .catch(() => {})
    if (home) load(home.lat, home.lng)
    else
      locate({ maxAge: ROUGH, ask: false }).then((fix) => {
        if (fix && !cancelled) load(fix.lat, fix.lng)
      })
    return () => {
      cancelled = true
    }
  }, [home])
  const nudge = useMemo(() => weatherNudge(weather), [weather])
  const match = useMemo(
    () =>
      nudge
        ? (places.find((place) => place.status === 'Want to try' && fitsNudge(place, nudge)) ??
          places.find((place) => fitsNudge(place, nudge)))
        : null,
    [places, nudge],
  )
  if (!nudge) return null
  return (
    <div className="weather-nudge preview-pop">
      <span className="weather-emoji" aria-hidden="true">
        {nudge.emoji}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{nudge.text}</span>
        {match && (
          <>
            {' '}
            <button
              className="font-semibold text-primary underline"
              onClick={() => onSelect(match)}
            >
              {match.name} fits.
            </button>
          </>
        )}
        <a
          className="mt-0.5 block text-[0.625rem] text-muted-foreground"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
        >
          Weather by Open-Meteo.com
        </a>
      </span>
    </div>
  )
}
