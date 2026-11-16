import { ImageResponse } from 'next/og'
import { shareCard } from '@/lib/og-card'

// Third pass #8: the picture a link to Crumbs' home page shows in a chat or feed (before, none).
// Drawn once at build time.
export const alt = 'Crumbs — your food map, for you and your people'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    shareCard({
      name: 'Where should we eat?',
      meta: 'Save places, rate dishes, decide together. For you, and the people you eat with.',
      score: null,
      known: null,
    }),
    size,
  )
}
