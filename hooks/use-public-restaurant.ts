'use client'
// The shared (everyone-together) page data for a place inside the app. Null while loading, for a
// place that isn't linked to a restaurant yet, or if the database doesn't have the public-pages
// update yet — in all of those the place sheet just keeps its old layout.
import { useEffect, useMemo, useState } from 'react'
import type { PublicRestaurant } from '@/lib/public-page'
import { DEMO_RESTAURANT } from '@/lib/public-demo'

// Last answer per place, so opening the same place again shows the page straight away.
const seen = new Map<string, PublicRestaurant | null>()

/** undefined = still loading, null = nothing to show (not linked or the lookup failed). */
export function usePublicRestaurant({
  restaurantId,
  name,
  supabase,
  demo,
}: {
  restaurantId?: string | null
  name: string
  supabase: any
  demo: boolean
}) {
  const [fetched, setFetched] = useState<{ id: string; data: PublicRestaurant | null } | null>(null)
  useEffect(() => {
    if (demo || !restaurantId) return
    let live = true
    ;(async () => {
      try {
        const { data: row, error } = await supabase.rpc('restaurant_public_by_id', {
          target: restaurantId,
        })
        const next = error || !row ? null : (row as PublicRestaurant)
        seen.set(restaurantId, next)
        if (live) setFetched({ id: restaurantId, data: next })
      } catch {
        seen.set(restaurantId, null)
        if (live) setFetched({ id: restaurantId, data: null })
      }
    })()
    return () => {
      live = false
    }
  }, [restaurantId, supabase, demo])
  const demoData = useMemo(() => (demo ? { ...DEMO_RESTAURANT, name } : null), [demo, name])
  if (demo) return demoData
  if (!restaurantId) return null
  if (fetched && fetched.id === restaurantId) return fetched.data
  return seen.has(restaurantId) ? (seen.get(restaurantId) ?? null) : undefined
}
