// O2 (Round 92): the "Rated on Crumbs" badge an owner can put on their own website. An image
// (SVG) that links to their Crumbs page; shows the score only once 3+ groups have rated (the usual
// rule), otherwise "Find us on Crumbs". Kept by Vercel for an hour.
import { loadRestaurant } from '@/lib/public-data'
import { isRedirect } from '@/lib/public-page'
import { badgeSvg } from '@/lib/site-badge'

export const revalidate = 3600

export async function GET(_request: Request, { params }: { params: Promise<{ city: string; slug: string }> }) {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug).catch(() => null)
  if (!data || isRedirect(data)) return new Response('Not found', { status: 404 })
  return new Response(badgeSvg(data), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
      'x-content-type-options': 'nosniff',
    },
  })
}
