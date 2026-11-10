'use client'
// "Is this their website?" right under the links, for websites Crumbs found itself (open data or
// the site's own page) and no member has confirmed yet. One tap; Yes counts as a member check.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Place } from '@/hooks/use-crumbs-data'
import type { RestaurantStore } from '@/hooks/use-restaurant'
import { haptic } from '@/lib/motion'
import { thanks } from './restaurant-profile'

const key = (id: string) => `crumbs-sitechip:${id}`

/** True when this website was found by Crumbs (not a member or the owner) and nobody has checked it. */
export function websiteNeedsCheck(r: RestaurantStore['restaurant']) {
  if (!r || r.owner_verified) return false
  const src = r.sources?.website
  if (src !== 'osm' && src !== 'site') return false
  return !r.verified?.website?.claimed
}

export function WebsiteCheck({
  place,
  store,
  demo,
}: {
  place: Place
  store: RestaurantStore
  demo: boolean
}) {
  const r = store.restaurant
  const rid = r?.id
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try {
      setHidden(!!rid && localStorage.getItem(key(rid)) === '1')
    } catch {
      setHidden(false)
    }
  }, [rid])
  if (demo || !r || hidden || store.manages || !place.website || !websiteNeedsCheck(r)) return null

  function dismiss() {
    try {
      localStorage.setItem(key(r!.id), '1')
    } catch {}
    setHidden(true)
  }
  async function yes() {
    try {
      const result = await store.contribute('website', r!.website, 'in_person')
      if (!result) return
      haptic('success')
      toast.success(thanks('website', result))
      dismiss()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save that')
    }
  }

  return (
    <div className="flex w-full items-center gap-2 text-xs text-muted-foreground" role="group" aria-label="Check the website">
      <span>Is this their website?</span>
      <button className="chip chip-sm chip-active" onClick={yes}>
        Yes
      </button>
      <button
        className="chip chip-sm"
        onClick={() => {
          dismiss()
          toast('Thanks — fix it under Info → Website')
        }}
      >
        No
      </button>
    </div>
  )
}
