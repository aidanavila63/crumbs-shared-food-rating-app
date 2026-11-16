// Fetching the public pages' data on the server. The anonymous key and no cookies, so the pages
// can be cached (a stranger, a link preview and a signed-in member all get the same totals).
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { readDishOfWeek, type PublicProfile, type PublicRedirect, type PublicRestaurant } from './public-page'
import { DEMO_PROFILE, DEMO_RESTAURANT } from './public-demo'
import { readMaybeClosed } from './maybe-closed'

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function anon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

const clean = (s: string) => decodeURIComponent(s).trim().toLowerCase().slice(0, 120)

// E14 (Round 77): the page and its link preview ask once per visit, not twice (cache), and the
// page itself is kept by Vercel for its revalidate time (generateStaticParams in the route).
export const loadRestaurant = cache(readRestaurant)
export const loadProfile = cache(readProfile)

async function readRestaurant(
  city: string,
  slug: string,
): Promise<PublicRestaurant | PublicRedirect | null> {
  if (demo) return slug === DEMO_RESTAURANT.slug ? DEMO_RESTAURANT : null
  try {
    const { data, error } = await anon().rpc('restaurant_public', {
      city_slug: clean(city),
      rest_slug: clean(slug),
    })
    // Round 77: a database hiccup is an error, not "no such page" — otherwise the cached copy
    // (E14) would remember a "not found" for an hour.
    if (error) throw new Error(error.message)
    const page = (data as PublicRestaurant | PublicRedirect | null) ?? null
    // A booking link shows only once an admin has switched it on for this restaurant.
    if (page && 'id' in page && page.id) {
      const [{ data: link }, { data: closed }, { data: dish }] = await Promise.all([
        anon().rpc('reservation_link', { target: page.id }),
        anon().rpc('maybe_closed', { target: page.id }),
        anon().rpc('dish_of_the_week'),
      ])
      if (typeof link === 'string' && /^https?:\/\//i.test(link)) (page as PublicRestaurant).reservation_url = link
      ;(page as PublicRestaurant).maybe_closed = readMaybeClosed(closed)
      ;(page as PublicRestaurant).dish_of_week = readDishOfWeek(dish)
    }
    return page
  } catch (error) {
    if (demo) return null
    throw error
  }
}

async function readProfile(handle: string): Promise<PublicProfile | null> {
  if (demo) return clean(handle) === DEMO_PROFILE.handle ? DEMO_PROFILE : null
  const { data, error } = await anon().rpc('public_profile', { h: clean(handle) })
  if (error) throw new Error(error.message)
  return (data as PublicProfile | null) ?? null
}
