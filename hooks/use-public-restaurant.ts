'use client'
// The shared (everyone-together) page data for a place inside the app. Null while loading, for a
// place that isn't linked to a restaurant yet, or if the database doesn't have the public-pages
// update yet — in all of those the place sheet just keeps its old layout.
import { useEffect, useMemo, useState } from 'react'
import type { PublicRestaurant } from '@/lib/public-page'
import { demoRestaurantFor } from '@/lib/public-demo'

// Last answer per place, so opening the same place again shows the page straight away.
const seen = new Map<string, PublicRestaurant | null>()

/** undefined = still loading, null = nothing to show (not linked or the lookup failed). */
export function usePublicRestaurant({
  restaurantId,
  name,
  supabase,
  demo,
  own,
}: {
  restaurantId?: string | null
  name: string
  /** demo only: the place's own facts (D8) */
  own?: { cuisine?: string | null; price_level?: number | null; address?: string | null }
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
  const ownCuisine = own?.cuisine
  const ownPrice = own?.price_level
  const ownAddress = own?.address
  const demoData = useMemo(
    () =>
      demo
        ? demoRestaurantFor({ name, cuisine: ownCuisine, price_level: ownPrice, address: ownAddress })
        : null,
    [demo, name, ownCuisine, ownPrice, ownAddress],
  )
  if (demo) return demoData
  if (!restaurantId) return null
  if (fetched && fetched.id === restaurantId) return fetched.data
  return seen.has(restaurantId) ? (seen.get(restaurantId) ?? null) : undefined
}
