'use client'
// Website, menu, call and booking links at the top of a place, plus the free "read their own
// website" backup: hours, cuisine and price the restaurant publishes fill any gaps Crumbs has
// (Google still wins when it answers — site hours are saved as unchecked so Google refreshes them).
import { useEffect, useRef, useState } from 'react'
import { type MaybeClosed, readMaybeClosed } from '@/lib/maybe-closed'
import { CalendarCheck, Globe, Phone, UtensilsCrossed } from 'lucide-react'
import type { Place } from '@/hooks/use-crumbs-data'
import type { SiteInfo } from '@/lib/site-info'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import { WebsiteCheck } from './website-check'

const DAY = 864e5

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Website'
  }
}

/** Reads the site through Crumbs' server (cached on this phone for 3 days). */
export function useSiteInfo(website: string | null, enabled = true) {
  const [info, setInfo] = useState<SiteInfo | null>(null)
  useEffect(() => {
    setInfo(null)
    if (!website || !enabled) return
    const key = `crumbs-site:${website}`
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (saved && Date.now() - saved.at < 3 * DAY) {
        setInfo(saved.info)
        return
      }
    } catch {}
    let live = true
    fetch(`/api/site-info?url=${encodeURIComponent(website)}`, {
      signal: AbortSignal.timeout(15_000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!live || !json) return
        setInfo(json.info ?? null)
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), info: json.info ?? null }))
        } catch {}
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [website, enabled])
  return info
}

/** The booking link, but only when an admin has agreed it for this restaurant (else null). */
export function useReservationLink(supabase: any, restaurantId: string | null | undefined, demo: boolean) {
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    setLink(null)
    if (demo || !restaurantId) return
    let live = true
    Promise.resolve(supabase.rpc('reservation_link', { target: restaurantId }))
      .then(({ data }: any) => {
        if (live && typeof data === 'string' && /^https?:\/\//i.test(data)) setLink(data)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [supabase, restaurantId, demo])
  return link
}

/** Part three: people from 2+ groups said lately that it looked closed (null otherwise). */
export function useMaybeClosed(supabase: any, restaurantId: string | null | undefined, demo: boolean) {
  const [info, setInfo] = useState<MaybeClosed | null>(null)
  useEffect(() => {
    setInfo(null)
    if (demo || !restaurantId) return
    let live = true
    Promise.resolve(supabase.rpc('maybe_closed', { target: restaurantId }))
      .then(({ data }: any) => {
        if (live) setInfo(readMaybeClosed(data))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [supabase, restaurantId, demo])
  return info
}

export function PlaceLinks({
  place,
  supabase,
  demo,
  onUpdate,
  store,
}: {
  place: Place
  supabase: any
  demo: boolean
  onUpdate: (place: Place) => void
  store?: RestaurantStore
}) {
  const info = useSiteInfo(place.website, !demo && navigator.onLine)
  const reserve = useReservationLink(supabase, place.restaurant_id, demo)
  const latest = useRef(place)
  useEffect(() => {
    latest.current = place
  })
  const filled = useRef<string | null>(null)

  useEffect(() => {
    if (!info || demo || filled.current === place.id) return
    filled.current = place.id
    const now = latest.current
    const changes: Partial<Place> = {}
    if (!now.opening_hours && info.periods)
      changes.opening_hours = { utc: -new Date().getTimezoneOffset(), periods: info.periods }
    if (!now.cuisine && info.cuisine) changes.cuisine = info.cuisine
    if (now.price_level == null && info.price_level) changes.price_level = info.price_level
    if (!Object.keys(changes).length) return
    onUpdate({ ...now, ...changes })
    supabase.from('places').update(changes).eq('id', now.id).then(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, place.id])

  if (!place.website) return null
  const links: { href: string; label: string; icon: React.ReactNode; main?: boolean }[] = [
    { href: place.website, label: host(place.website), icon: <Globe size={15} />, main: true },
  ]
  if (info?.menu_url) links.push({ href: info.menu_url, label: 'Menu', icon: <UtensilsCrossed size={15} /> })
  if (info?.phone)
    links.push({ href: `tel:${info.phone.replace(/[^\d+]/g, '')}`, label: 'Call', icon: <Phone size={15} /> })
  // Booking links are held, not shown: only once an admin has switched this restaurant on.
  if (reserve) links.push({ href: reserve, label: 'Book', icon: <CalendarCheck size={15} /> })

  return (
    <div className="place-links" aria-label="Links">
      {links.map((link) => (
        <a
          key={link.label}
          className={`place-link ${link.main ? 'place-link-main' : ''}`}
          href={link.href}
          target={link.href.startsWith('tel:') ? undefined : '_blank'}
          rel="noopener noreferrer"
        >
          {link.icon}
          <span className="truncate">{link.label}</span>
        </a>
      ))}
      {store && <WebsiteCheck place={place} store={store} demo={demo} />}
    </div>
  )
}
