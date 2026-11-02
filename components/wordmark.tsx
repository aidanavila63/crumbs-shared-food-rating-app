// The Crumbs wordmark: "crumbs" in Fredoka SemiBold with the cookie "c" (a bite out of the top) and crumbs
// curling up off the "s". Letters are outlined paths, so no font download. Plum on light, near-white on dark.
import { WORDMARK } from '@/lib/wordmark-data'

export const BRAND_COOKIE = '#F2A845'
export const BRAND_CHIPS = '#C9752A'
export const BRAND_SPECKS = '#F9D08A'

export function Wordmark({ height = 36, className = '' }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox={WORDMARK.vb}
      height={height}
      width={Math.round(height * WORDMARK.aspect)}
      role="img"
      aria-label="crumbs"
      className={`wordmark block shrink-0 ${className}`}
    >
      <path d={WORDMARK.text} fill="var(--wordmark-ink)" />
      <path d={WORDMARK.cookie} fill={BRAND_COOKIE} />
      <path d={WORDMARK.chips} fill={BRAND_CHIPS} />
      <path d={WORDMARK.hi} fill={BRAND_SPECKS} />
      <path d={WORDMARK.crumbs} fill={BRAND_COOKIE} />
    </svg>
  )
}

/** The wordmark as a standalone SVG string (for canvas drawings like the owner poster). */
export function wordmarkSvg(ink = '#7B2D5B') {
  const [, , w, h] = WORDMARK.vb.split(' ').map(Number)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK.vb}" width="${w}" height="${h}">` +
    `<path d="${WORDMARK.text}" fill="${ink}"/><path d="${WORDMARK.cookie}" fill="${BRAND_COOKIE}"/>` +
    `<path d="${WORDMARK.chips}" fill="${BRAND_CHIPS}"/><path d="${WORDMARK.hi}" fill="${BRAND_SPECKS}"/>` +
    `<path d="${WORDMARK.crumbs}" fill="${BRAND_COOKIE}"/></svg>`
  )
}
