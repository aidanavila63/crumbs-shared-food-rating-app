import { ImageResponse } from 'next/og'
import { loadRestaurant } from '@/lib/public-data'
import { isRedirect, metaLine, scoreLine } from '@/lib/public-page'
import { shareCard } from '@/lib/og-card'

// The picture a link to this page shows in a chat or feed: name, what it is, how the groups
// rate it, in Crumbs' colours. Cached like the page itself.
export const revalidate = 3600
export const alt = 'A restaurant on Crumbs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ city: string; slug: string }> }) {
  const { city, slug } = await params
  const data = await loadRestaurant(city, slug)
  const r = data && !isRedirect(data) ? data : null
  const name = (r?.name ?? 'Crumbs').slice(0, 60)
  const meta = r ? metaLine(r) : 'Your shared food map'
  const score = r ? scoreLine(r) : null
  const known = r?.top_dishes?.[0]?.name
  return new ImageResponse(shareCard({ name, meta, score, known }), size)
}
