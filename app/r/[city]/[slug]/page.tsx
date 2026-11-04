import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { loadRestaurant } from '@/lib/public-data'
import { isRedirect, pageDescription, restaurantPath } from '@/lib/public-page'
import { PublicRestaurantView } from '@/components/public-restaurant-view'

// Anyone with the link can read it (not listed in search engines). Cached for an hour — it's
// totals from many groups, so it doesn't need to be live to the second.
export const revalidate = 3600

type Params = { params: Promise<{ city: string; slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug)
  if (!data || isRedirect(data)) return { title: 'Crumbs', robots: { index: false, follow: false } }
  const description = pageDescription(data)
  return {
    title: `${data.name} · Crumbs`,
    description,
    openGraph: { title: `${data.name} on Crumbs`, description },
    robots: { index: false, follow: false },
  }
}

export default async function RestaurantRoute({ params }: Params) {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug)
  if (!data) notFound()
  if (isRedirect(data)) redirect(restaurantPath(data.redirect.city, data.redirect.slug))
  return <PublicRestaurantView data={data} />
}
