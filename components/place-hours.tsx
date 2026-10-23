'use client'
import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Place } from '@/hooks/use-crumbs-data'
import { markGoogleDown, useGoogleDown } from '@/lib/google-status'
import { hasGoogleId, hoursAreStale, hoursFromGoogle, isClosedForever, openStatus, takeQuota } from '@/lib/place-info'

/** Asks Google for opening hours + whether the place has closed, and saves them on the place. */
async function refreshHours(places: any, supabase: any, place: Place, demo: boolean) {
  const googlePlace = new places.Place({ id: place.google_place_id })
  await googlePlace.fetchFields({ fields: ['regularOpeningHours', 'businessStatus', 'utcOffsetMinutes'] })
  const changes = {
    opening_hours: hoursFromGoogle(googlePlace),
    business_status: (googlePlace.businessStatus as string | null) ?? null,
    hours_checked_at: new Date().toISOString(),
  }
  if (!demo) {
    const { error } = await supabase.from('places').update(changes).eq('id', place.id)
    if (error) throw error
  }
  return changes
}

/** Small "Open · closes 9 PM" / "Permanently closed" line; refreshes the hours when you open the place. */
export function PlaceHours({
  place,
  supabase,
  demo,
  onUpdate,
}: {
  place: Place
  supabase: any
  demo: boolean
  onUpdate: (place: Place) => void
}) {
  const places = useMapsLibrary('places')
  const googleDown = useGoogleDown()
  const tried = useRef(false)
  useEffect(() => {
    if (tried.current || !places || googleDown || !hasGoogleId(place) || !hoursAreStale(place)) return
    tried.current = true
    if (!takeQuota('hours', 12)) return
    refreshHours(places, supabase, place, demo)
      .then((changes) => onUpdate({ ...place, ...changes }))
      .catch(() => {
        if (navigator.onLine) markGoogleDown()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, googleDown, place.id])

  if (isClosedForever(place))
    return <p className="text-sm font-semibold text-destructive">⚠ Permanently closed</p>
  if (place.business_status === 'CLOSED_TEMPORARILY')
    return <p className="text-sm font-semibold text-destructive">Temporarily closed</p>
  const status = openStatus(place.opening_hours)
  if (!status) return null
  return (
    <p className={`text-sm font-semibold ${status.open ? 'text-[#2f7d4f]' : 'text-muted-foreground'}`}>
      {status.open ? '● ' : '○ '}
      {status.text}
    </p>
  )
}

/** Quietly keeps want-to-try places up to date (at most 2 per visit, within a small daily budget). */
export function HoursRefresher({
  places: all,
  supabase,
  demo,
  onPlace,
}: {
  places: Place[]
  supabase: any
  demo: boolean
  onPlace: (id: string, changes: Partial<Place>) => void
}) {
  const places = useMapsLibrary('places')
  const googleDown = useGoogleDown()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !places || googleDown || !all.length) return
    done.current = true
    const stale = all
      .filter((place) => place.status === 'Want to try' && hasGoogleId(place) && hoursAreStale(place))
      .slice(0, 2)
    ;(async () => {
      for (const place of stale) {
        if (!takeQuota('hours', 12)) return
        try {
          onPlace(place.id, await refreshHours(places, supabase, place, demo))
        } catch {
          return
        }
      }
    })()
  }, [places, googleDown, all, supabase, demo, onPlace])
  return null
}
