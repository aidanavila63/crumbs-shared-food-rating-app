// #35 Weather nudges. Uses Open-Meteo (free, no key, no Crumbs storage). Data: CC BY 4.0, Open-Meteo.com.
// Note: Open-Meteo's free API is for non-commercial use; revisit if Crumbs is monetized.

export type Weather = { temp: number; code: number; isDay: boolean }
export type Nudge = { emoji: string; text: string; cuisines: string[] }

const COMFORT = ['ramen', 'pho', 'soup', 'noodle', 'curry', 'hot pot', 'udon', 'stew', 'pasta']
const SUMMER = ['mexican', 'taco', 'ice cream', 'gelato', 'poke', 'salad', 'sushi', 'patio', 'bbq']

const rainy = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82)
const snowy = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86
const stormy = (code: number) => code >= 95

/** Turns the weather into one short, obviously-weather-based suggestion (or nothing). */
export function weatherNudge(weather: Weather | null): Nudge | null {
  if (!weather) return null
  const t = Math.round(weather.temp)
  if (stormy(weather.code))
    return { emoji: '⛈️', text: 'Stormy out — somewhere close to home tonight?', cuisines: COMFORT }
  if (snowy(weather.code))
    return { emoji: '❄️', text: 'Snowy — something warm and cosy?', cuisines: COMFORT }
  if (rainy(weather.code))
    return { emoji: '🌧️', text: 'Rainy tonight — soup or ramen weather.', cuisines: COMFORT }
  if (t <= 3) return { emoji: '🥶', text: `${t}° out — hot food weather.`, cuisines: COMFORT }
  if (t >= 26) return { emoji: '☀️', text: `${t}° — patio, tacos or ice cream?`, cuisines: SUMMER }
  if (weather.code <= 1 && t >= 15)
    return { emoji: '🌤️', text: `${t}° and clear — nice night to walk to dinner.`, cuisines: [] }
  return null
}

/** Does this place fit the nudge? Looks at cuisine, tags and name. */
export function fitsNudge(
  place: { name: string; cuisine: string | null; tags?: string[] },
  nudge: Nudge,
) {
  if (!nudge.cuisines.length) return false
  const text = `${place.name} ${place.cuisine ?? ''} ${(place.tags ?? []).join(' ')}`.toLowerCase()
  return nudge.cuisines.some((word) => text.includes(word))
}

const CACHE = 'crumbs-weather-cache'

/** Current weather near a point, cached for 30 minutes on this phone. */
export async function currentWeather(lat: number, lng: number): Promise<Weather | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE) ?? 'null')
    if (saved?.key === key && Date.now() - saved.at < 30 * 60 * 1000) return saved.weather
  } catch {}
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m,weather_code,is_day`
  const response = await fetch(url)
  if (!response.ok) return null
  const body = await response.json()
  const weather: Weather = {
    temp: Number(body?.current?.temperature_2m),
    code: Number(body?.current?.weather_code),
    isDay: body?.current?.is_day === 1,
  }
  if (!Number.isFinite(weather.temp) || !Number.isFinite(weather.code)) return null
  try {
    sessionStorage.setItem(CACHE, JSON.stringify({ key, at: Date.now(), weather }))
  } catch {}
  return weather
}
