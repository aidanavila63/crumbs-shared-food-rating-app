import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { loadRestaurant } from '@/lib/public-data'
import { isRedirect, restaurantPath } from '@/lib/public-page'
import { TableMenu } from '@/components/table-menu'

// O1 (Round 89): the menu on its own, for the QR code on a restaurant's tables. Same data and
// caching as the restaurant page (/r/<city>/<name>), nothing else on it.
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

type Params = { params: Promise<{ city: string; slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug).catch(() => null)
  if (!data || isRedirect(data)) return { title: 'Menu · Crumbs', robots: { index: false, follow: false } }
  return { title: `${data.name} menu · Crumbs`, robots: { index: false, follow: false } }
}

export default async function TableMenuRoute({ params }: Params) {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug)
  if (!data) notFound()
  if (isRedirect(data)) redirect(`${restaurantPath(data.redirect.city, data.redirect.slug)}/menu`)
  return <TableMenu data={data} />
}
