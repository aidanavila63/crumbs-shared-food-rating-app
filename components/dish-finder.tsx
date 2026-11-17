'use client'
// U1 (Round 82): find a dish across Crumbs — which restaurants have it on their Crumbs menu,
// nearest first when you allow location. How many groups have it and how they rate it only shows
// once 3 or more groups do (never who). Tapping a result opens the restaurant's page.
import { useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { toast } from 'sonner'
import { haptic } from '@/lib/motion'
import { lastFix, locate, ROUGH, type LatLng } from '@/lib/location'
import { restaurantPath } from '@/lib/public-page'
import { dishFinderLine, type DishHit } from '@/lib/dish-finder'

const DEMO: DishHit[] = [
  {
    id: 'demo-df-1',
    name: 'Golden Dumpling House',
    dish: 'Pork & chive dumplings',
    price: 12,
    owner_ok: true,
    confirms: 6,
    groups: 4,
    rating: 4.6,
    distance_km: 0.8,
    city: null,
    slug: null,
  },
  {
    id: 'demo-df-2',
    name: 'Night Market Noodles',
    dish: 'Pan-fried dumplings',
    price: 10.5,
    owner_ok: false,
    confirms: 2,
    groups: null,
    rating: null,
    distance_km: 2.4,
    city: null,
    slug: null,
  },
]

export function DishFinder({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [q, setQ] = useState('')
  const [near, setNear] = useState<LatLng | null>(() => lastFix(ROUGH))
  const [hits, setHits] = useState<DishHit[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function search(spot = near) {
    const term = q.trim()
    if (term.length < 3) return toast('Type at least 3 letters')
    setBusy(true)
    try {
      if (demo) {
        setHits(DEMO)
        return
      }
      const { data, error } = await supabase.rpc('find_dish', {
        q: term,
        lat: spot?.lat ?? null,
        lng: spot?.lng ?? null,
      })
      if (error) throw error
      setHits((data ?? []) as DishHit[])
    } catch (error: any) {
      toast.error(
        /find_dish|schema cache|PGRST202/i.test(error?.message ?? '')
          ? 'The dish finder isn’t switched on yet'
          : error?.message || 'Could not search',
      )
    } finally {
      setBusy(false)
    }
  }
  async function useMyLocation() {
    haptic('tap')
    const spot = await locate({ maxAge: ROUGH })
    if (!spot)
      return toast('Location isn’t available — results are sorted by how many confirmed them')
    setNear(spot)
    if (q.trim().length >= 3) search(spot)
  }

  return (
    <div className="surface flex flex-col gap-3">
      <div>
        <span className="tag">Find a dish</span>
        <p className="mt-2 text-sm text-muted-foreground">
          Craving something? See which places on Crumbs have it{near ? ', nearest first' : ''}.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          className="field"
          aria-label="Dish"
          placeholder="e.g. khao soi, birria tacos"
          value={q}
          maxLength={60}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && search()}
        />
        <button
          className="primary shrink-0"
          aria-label="Find"
          disabled={busy}
          onClick={() => search()}
        >
          <Search size={18} />
        </button>
      </div>
      {!near && (
        <button
          className="self-start text-sm font-semibold text-primary underline"
          onClick={useMyLocation}
        >
          <MapPin size={14} className="inline" /> Nearest first
        </button>
      )}
      {hits && !hits.length && (
        <p className="text-sm text-muted-foreground">
          Nobody’s added that dish to a Crumbs menu{near ? ' near you' : ''} yet.
        </p>
      )}
      {hits?.map((hit) => {
        const href = hit.city && hit.slug ? restaurantPath(hit.city, hit.slug) : null
        const body = (
          <>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{hit.name}</span>
              <span className="block truncate text-sm">{hit.dish}</span>
              <span className="block text-xs text-muted-foreground">{dishFinderLine(hit)}</span>
            </span>
            {hit.price != null && (
              <span className="shrink-0 text-sm font-semibold">
                ${Number(hit.price).toFixed(2)}
              </span>
            )}
          </>
        )
        return href ? (
          <a
            key={hit.id}
            href={href}
            className="surface-soft flex items-center justify-between gap-3"
          >
            {body}
          </a>
        ) : (
          <div key={hit.id} className="surface-soft flex items-center justify-between gap-3">
            {body}
          </div>
        )
      })}
    </div>
  )
}
