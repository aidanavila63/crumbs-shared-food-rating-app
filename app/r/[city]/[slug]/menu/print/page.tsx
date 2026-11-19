import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { loadRestaurant } from '@/lib/public-data'
import { isRedirect, restaurantPath } from '@/lib/public-page'
import { PrintMenu } from '@/components/print-menu'

// O15 v2 (Round 99): the table menu to print, in the restaurant's own look — a table tent with the
// QR (fold in half) and the full menu. Same data and caching as the table menu page.
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

type Params = { params: Promise<{ city: string; slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug).catch(() => null)
  const name = data && !isRedirect(data) ? data.name : 'Menu'
  return { title: `${name}: print the menu · Crumbs`, robots: { index: false, follow: false } }
}

export default async function PrintMenuRoute({ params }: Params) {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug)
  if (!data) notFound()
  if (isRedirect(data)) redirect(`${restaurantPath(data.redirect.city, data.redirect.slug)}/menu/print`)
  return <PrintMenu data={data} />
}
