'use client'
// Links a group place to its shared restaurant profile and loads the community menu.
import { useCallback, useEffect, useState } from 'react'
import type { Place } from './use-crumbs-data'
import {
  contributeFact,
  dishKey,
  linkRestaurant,
  loadInsights,
  matchOpenData,
  loadMenu,
  loadRestaurant,
  shareable,
  shareDishes,
  sortMenu,
  voteDish,
  type Evidence,
  type Insights,
  type FactField,
  type MenuDish,
  type NewMenuDish,
  type Restaurant,
} from '@/lib/restaurants'
import { localUtcOffset } from '@/lib/hours-text'

const demoMenu = (restaurantId: string): MenuDish[] =>
  [
    ['Tonkotsu Ramen', 16.5, 'main', 4, 'Rich pork broth, chashu, egg'],
    ['Spicy Miso Ramen', 17, 'main', 2, null],
    ['Pork Gyoza', 9.5, 'starter', 3, 'Six pieces, chili oil'],
    ['Matcha Mochi', 6, 'dessert', 1, null],
  ].map(([name, price, course, confirms, description], i) => ({
    id: `demo-menu-${i}`,
    restaurant_id: restaurantId,
    name: name as string,
    name_key: dishKey(name as string),
    price: price as number,
    description: description as string | null,
    course: course as MenuDish['course'],
    dietary: [],
    source: 'photo',
    confirms: confirms as number,
    flags: 0,
    price_checked_at: new Date(Date.now() - (i + 1) * 20 * 864e5).toISOString(),
  }))

export function useRestaurant({
  place,
  userId,
  supabase,
  demo,
  v4,
  onLinked,
}: {
  place: Place
  userId?: string
  supabase: any
  demo: boolean
  v4: boolean
  onLinked: (restaurantId: string) => void
}) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [menu, setMenu] = useState<MenuDish[]>([])
  const [mine, setMine] = useState<Record<string, 'confirm' | 'flag'>>({})
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [manages, setManages] = useState(false)
  const enabled = (v4 || demo) && shareable(place.google_place_id)

  const reload = useCallback(
    async (id: string) => {
      if (demo) return
      const result = await loadMenu(supabase, id, userId)
      setMenu(result.menu)
      setMine(result.mine)
    },
    [demo, supabase, userId],
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        if (demo) {
          const id = `demo-restaurant-${place.id}`
          setRestaurant({
            id,
            source_key: place.google_place_id,
            name: place.name,
            places_count: 2,
            formatted_address: place.formatted_address,
            opening_hours: place.opening_hours ?? null,
            business_status: 'OPERATIONAL',
            price_level: place.price_level,
            cuisine: place.cuisine,
            website: null,
            phone: null,
            sources: {
              address: 'osm',
              hours: 'google',
              cuisine: 'crumbs',
              status: 'google',
              price_level: 'google',
            },
            verified: { cuisine: { n: 2, at: new Date().toISOString() } },
          } as Restaurant)
          setMenu(place.id === 'demo-ramen' ? demoMenu(id) : [])
          setInsights({ visits: 9, groups: 3, per_head: 24, takeout_share: 30 })
          return
        }
        // Link once (creates the shared profile the first time anyone saves this restaurant).
        const r = place.restaurant_id
          ? await loadRestaurant(supabase, place.restaurant_id)
          : await linkRestaurant(supabase, place.id)
        if (cancelled || !r) return
        setRestaurant(r)
        if (!place.restaurant_id) onLinked(r.id)
        await reload(r.id)
        loadInsights(supabase, r.id).then((data) => !cancelled && setInsights(data))
        if (userId)
          supabase
            .from('restaurant_managers')
            .select('user_id')
            .eq('restaurant_id', r.id)
            .eq('user_id', userId)
            .maybeSingle()
            .then(({ data }: any) => !cancelled && setManages(!!data))
        // Fill gaps from OpenStreetMap (free data we can keep) — at most every ~3 months.
        const stale =
          !r.osm_checked_at || Date.now() - new Date(r.osm_checked_at).getTime() > 90 * 864e5
        if (stale && r.latitude !== null) {
          const result = await matchOpenData(r.id, localUtcOffset()).catch(() => null)
          if (!cancelled && result?.matched) {
            const fresh = await loadRestaurant(supabase, r.id)
            if (fresh && !cancelled) setRestaurant(fresh)
          }
        }
      } catch {
        // The menu is a bonus; the place page works without it.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, place.id, place.restaurant_id])

  /** A member adds or confirms a fact they saw themselves (#27 owning the data). */
  async function contribute(fact: FactField, val: unknown, how: Evidence = 'in_person') {
    if (!restaurant) return null
    if (demo) {
      const next = { ...restaurant } as any
      const column: Record<string, string> = {
        address: 'formatted_address',
        hours: 'opening_hours',
        status: 'business_status',
      }
      next[column[fact] ?? fact] = val
      next.sources = { ...restaurant.sources, [fact]: 'crumbs' }
      const n = (restaurant.verified?.[fact]?.n ?? 0) + 1
      next.verified = { ...restaurant.verified, [fact]: { n, at: new Date().toISOString() } }
      setRestaurant(next)
      return { applied: true, agree: n }
    }
    const result = await contributeFact(supabase, restaurant.id, fact, val, how)
    const fresh = await loadRestaurant(supabase, restaurant.id)
    if (fresh) setRestaurant(fresh)
    return result
  }

  async function share(dishes: NewMenuDish[], how: 'photo' | 'website' | 'manual' | 'receipt') {
    if (!restaurant) return 0
    if (demo) {
      const have = new Set(menu.map((d) => d.name_key))
      const extra = dishes
        .filter((d) => !have.has(dishKey(d.name)))
        .map((d, i) => ({
          id: `demo-new-${Date.now()}-${i}`,
          restaurant_id: restaurant.id,
          name: d.name,
          name_key: dishKey(d.name),
          price: d.price ?? null,
          description: d.description ?? null,
          course: d.course ?? null,
          dietary: [],
          source: how,
          confirms: 1,
          flags: 0,
          price_checked_at: new Date().toISOString(),
        }))
      setMenu(sortMenu([...menu, ...extra]))
      return dishes.length
    }
    const count = await shareDishes(supabase, restaurant.id, dishes, how)
    await reload(restaurant.id)
    return count
  }

  async function vote(dish: MenuDish, choice: 'confirm' | 'flag' | null) {
    const before = { menu, mine }
    const prev = mine[dish.id]
    const delta = (c: 'confirm' | 'flag') => (choice === c ? 1 : 0) - (prev === c ? 1 : 0)
    setMine({ ...mine, ...(choice ? { [dish.id]: choice } : {}) })
    if (!choice) setMine(Object.fromEntries(Object.entries(mine).filter(([k]) => k !== dish.id)))
    setMenu(
      menu.map((d) =>
        d.id === dish.id
          ? { ...d, confirms: d.confirms + delta('confirm'), flags: d.flags + delta('flag') }
          : d,
      ),
    )
    if (demo || !restaurant) return
    try {
      await voteDish(supabase, dish.id, choice)
      await reload(restaurant.id)
    } catch {
      setMenu(before.menu)
      setMine(before.mine)
    }
  }

  return { enabled, restaurant, menu, mine, loading, insights, manages, share, vote, contribute }
}

export type RestaurantStore = ReturnType<typeof useRestaurant>
