'use client'
// U22 (Round 96): restaurants near you that 3+ groups on Crumbs rated 4★ or more, that none of your
// spaces has yet. Only when the phone already knows where you are (Crumbs doesn't ask here).
// Totals only — never who or which group.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { locate } from '@/lib/location'
import { addLink, rememberPendingAdd } from '@/lib/pending-add'
import { restaurantPath } from '@/lib/public-page'

type Loved = {
  id: string
  name: string
  cuisine: string | null
  address: string | null
  km: number
  avg: number
  groups: number
  city: string | null
  slug: string | null
}

const DEMO: Loved[] = [
  { id: '00000000-0000-0000-0000-00000000d001', name: 'Lantern Pho', cuisine: 'Vietnamese', address: null, km: 0.8, avg: 4.4, groups: 12, city: 'etobicoke', slug: 'lantern-pho' },
]

export function LovedNearYou({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [list, setList] = useState<Loved[] | null>(demo ? DEMO : null)
  useEffect(() => {
    if (demo) return
    let live = true
    ;(async () => {
      const here = await locate({ ask: false, maxAge: 30 * 60_000 }).catch(() => null)
      if (!here || !live) return
      const { data, error } = await supabase.rpc('loved_near', { lat: here.lat, lng: here.lng, km: 5, lim: 8 })
      if (live && !error && Array.isArray(data)) setList(data)
    })()
    return () => {
      live = false
    }
  }, [demo, supabase])
  if (!list?.length) return null
  return (
    <div className="surface flex flex-col gap-3">
      <h3 className="card-heading">Loved near you</h3>
      <p className="-mt-2 text-xs text-muted-foreground">Rated 4★+ by 3 or more groups on Crumbs, within 5 km.</p>
      {list.map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            {r.city && r.slug ? (
              <Link className="font-semibold underline-offset-2 hover:underline" href={restaurantPath(r.city, r.slug)}>
                {r.name}
              </Link>
            ) : (
              <span className="font-semibold">{r.name}</span>
            )}
            <span className="block text-xs text-muted-foreground">
              {[r.cuisine, r.km < 1 ? `${Math.round(r.km * 100) * 10} m` : `${Number(r.km).toFixed(1)} km`, `${r.groups} groups`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <span className="flex items-center gap-1 font-serif text-lg text-primary">
            <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden="true" />
            {Number(r.avg).toFixed(1)}
          </span>
          <a
            className="chip chip-sm"
            href={addLink(r.id)}
            onClick={() => rememberPendingAdd(r.id)}
            aria-label={`Save ${r.name} to try`}
          >
            Save
          </a>
        </div>
      ))}
    </div>
  )
}
