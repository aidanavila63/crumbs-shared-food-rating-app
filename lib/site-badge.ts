// O2 (Round 92): the "Rated on Crumbs" website badge (an SVG image) and the code to paste.
import type { PublicRestaurant } from './public-page.ts'

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "★ 4.4 · 12 groups" once 3+ groups rated it, otherwise null. */
export function badgeLine(data: Pick<PublicRestaurant, 'rating'>) {
  const r = data.rating
  if (!r || r.groups < 3) return null
  return `★ ${Number(r.avg).toFixed(1)} · ${r.groups} groups`
}

export function badgeSvg(data: Pick<PublicRestaurant, 'name' | 'rating'>) {
  const line = badgeLine(data)
  const title = line ? `${data.name}: rated ${line} on Crumbs` : `${data.name} on Crumbs`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" viewBox="0 0 220 56" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <rect x="0.5" y="0.5" width="219" height="55" rx="14" fill="#FBF4E8" stroke="#7B2D5B"/>
  <circle cx="28" cy="28" r="15" fill="#E9A23B"/>
  <circle cx="23" cy="24" r="2.4" fill="#7B2D5B"/><circle cx="32" cy="22" r="2" fill="#7B2D5B"/>
  <circle cx="30" cy="32" r="2.4" fill="#7B2D5B"/><circle cx="22" cy="33" r="1.6" fill="#7B2D5B"/>
  <text x="52" y="${line ? 24 : 33}" font-family="Fredoka, system-ui, -apple-system, Segoe UI, sans-serif" font-size="${line ? 13 : 15}" font-weight="600" fill="#7B2D5B">${line ? 'Rated on Crumbs' : 'Find us on Crumbs'}</text>
  ${line ? `<text x="52" y="42" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" font-weight="600" fill="#1C2A23">${esc(line)}</text>` : ''}
</svg>
`
}

/** What the owner pastes into their website. */
export function badgeSnippet(origin: string, path: string, name: string) {
  return `<a href="${origin}${path}" target="_blank" rel="noopener"><img src="${origin}${path}/badge.svg" alt="${esc(name)} on Crumbs" width="220" height="56"></a>`
}
