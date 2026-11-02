'use client'
// #185 Loads what the hidden-gem check needs (one small database call per group load).
import { useEffect, useState } from 'react'
import type { Place } from './use-crumbs-data'
import type { GemCounts } from '@/lib/smart-lists'

export function useGems(places: Place[], supabase: any, demo: boolean): GemCounts | null {
  const [counts, setCounts] = useState<GemCounts | null>(null)
  const ids = [...new Set(places.map((p) => p.restaurant_id).filter(Boolean) as string[])]
    .sort()
    .join(',')
  useEffect(() => {
    let cancelled = false
    if (demo) {
      // Demo: pretend Crumbs is big enough and only you two found the ramen place.
      const saved: Record<string, number> = {}
      places.forEach(
        (p) => p.restaurant_id && (saved[p.restaurant_id] = p.id === 'demo-ramen' ? 1 : 8),
      )
      Promise.resolve().then(() => !cancelled && setCounts({ groups: 40, saved }))
    } else if (ids && supabase)
      supabase
        .rpc('gem_counts', { ids: ids.split(',') })
        .then(({ data, error }: any) => !cancelled && !error && data && setCounts(data))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, demo])
  return counts
}
