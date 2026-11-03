// Shareable QR posters: a story-sized picture (1080×1920, the size Instagram stories use) with the
// Crumbs wordmark, a headline, the Crumbs QR code and a line saying what scanning does. Drawn on a
// canvas in the browser, so nothing is uploaded or stored. Used for "join this group" and
// "join Crumbs"; the picture can be shared straight to Instagram, Messages, WhatsApp… or saved.
//
// Instagram covers roughly the top and bottom 250 px of a story with its own buttons, so everything
// that matters (wordmark, headline, QR, what-to-do line) sits between y = 230 and y = 1670.

export const POSTER_W = 1080
export const POSTER_H = 1920
const SAFE_TOP = 230
const SAFE_BOTTOM = 1670

const CREAM = '#FBF4E8'
const PLUM = '#7B2D5B'
const COOKIE = '#F2A845'
const INK = '#1C2A23'
const MUTED = '#5F6E65'

export type PosterSpec = {
  /** small line above the headline ("You're invited to") */
  eyebrow: string
  /** the headline (a group's name, or "Join Crumbs") */
  title: string
  /** an emoji in a round badge above the eyebrow (a group's emoji) */
  badge?: string | null
  badgeColor?: string | null
  /** what to do ("Scan to join our group") */
  caption: string
  /** a smaller line under it ("or use code ABC123") */
  sub?: string | null
  /** the line at the very bottom (the brand tagline) */
  tagline?: string | null
  /** where the QR code leads */
  link: string
  /** what a screen reader says about the QR code */
  qrLabel: string
}

/** Break text into at most `maxLines` lines no wider than `maxW` (greedy, by words). Returns the lines
 *  and whether everything fit; a single word wider than `maxW` gets its own line and reports no fit. */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxW: number,
  maxLines = 2,
): { lines: string[]; fits: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { lines: [''], fits: true }
  const lines: string[] = []
  let line = ''
  let fits = true
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || measure(next) <= maxW) {
      line = next
      continue
    }
    lines.push(line)
    line = word
  }
  lines.push(line)
  if (lines.length > maxLines || lines.some((l) => measure(l) > maxW)) fits = false
  return { lines, fits }
}

function load(src: string) {
  return new Promise<HTMLImageElement>((ok, bad) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = bad
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Draw the poster and give back a PNG. */
export async function makePoster(spec: PosterSpec): Promise<Blob> {
  const [{ brandQrSvg, svgDataUrl }, { wordmarkSvg }] = await Promise.all([
    import('./brand-qr'),
    import('../components/wordmark'),
  ])
  const family =
    getComputedStyle(document.body).getPropertyValue('--font-fredoka').trim() ||
    'Fredoka, system-ui, sans-serif'
  const [qr, word] = await Promise.all([
    brandQrSvg(spec.link, { size: 1000, label: spec.qrLabel }).then((svg) => load(svgDataUrl(svg))),
    load(svgDataUrl(wordmarkSvg())),
    ...['400', '500', '600'].map((w) => document.fonts.load(`${w} 48px ${family}`).catch(() => [])),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')!
  const cx = POSTER_W / 2

  // cream page with two soft splashes of cookie and plum
  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)
  ctx.fillStyle = 'rgba(242,168,69,0.18)'
  ctx.beginPath()
  ctx.arc(960, 120, 280, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(123,45,91,0.07)'
  ctx.beginPath()
  ctx.arc(80, 1800, 340, 0, Math.PI * 2)
  ctx.fill()

  const text = (value: string, weight: number, px: number, y: number, color: string) => {
    ctx.font = `${weight} ${px}px ${family}`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(value, cx, y)
  }
  const fitLine = (value: string, weight: number, px: number, color: string, y: number) => {
    let size = px
    ctx.font = `${weight} ${size}px ${family}`
    while (ctx.measureText(value).width > 900 && size > 28) {
      size -= 2
      ctx.font = `${weight} ${size}px ${family}`
    }
    text(value, weight, size, y, color)
  }

  // wordmark
  const ww = 480
  const wh = ww / (word.naturalWidth / word.naturalHeight || 4.87)
  let y = SAFE_TOP + 20
  ctx.drawImage(word, cx - ww / 2, y, ww, wh)
  y += wh + 56

  // group badge
  if (spec.badge) {
    const r = 62
    ctx.fillStyle = spec.badgeColor || '#E8EDE6'
    ctx.beginPath()
    ctx.arc(cx, y + r, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `${Math.round(r * 1.1)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = INK
    ctx.fillText(spec.badge, cx, y + r + 4)
    ctx.textBaseline = 'alphabetic'
    y += r * 2 + 44
  }

  // eyebrow + headline (shrinks, then wraps to a second line, for long group names)
  fitLine(spec.eyebrow, 500, 44, MUTED, y + 38)
  y += 38 + 40
  let px = 104
  let lines: string[] = []
  for (;;) {
    ctx.font = `600 ${px}px ${family}`
    const wrapped = wrapLines((t) => ctx.measureText(t).width, spec.title.slice(0, 60), 900, 2)
    lines = wrapped.lines
    if (wrapped.fits || px <= 48) break
    px -= 4
  }
  const lh = Math.round(px * 1.1)
  lines.slice(0, 2).forEach((line, i) => text(line, 600, px, y + px * 0.85 + i * lh, INK))
  y += Math.min(lines.length, 2) * lh + 28

  // QR on a plum card (the code keeps its own cream margin, so it still scans)
  const below = 70 + (spec.sub ? 66 : 0) + 24
  const card = Math.max(540, Math.min(720, SAFE_BOTTOM - y - below))
  const pad = 30
  const cardX = cx - card / 2
  ctx.fillStyle = PLUM
  roundRect(ctx, cardX, y, card, card, 64)
  ctx.fill()
  ctx.drawImage(qr, cardX + pad, y + pad, card - pad * 2, card - pad * 2)
  y += card

  // what to do
  fitLine(spec.caption, 600, 56, INK, y + 84)
  if (spec.sub) fitLine(spec.sub, 400, 42, MUTED, y + 84 + 62)

  if (spec.tagline) {
    ctx.fillStyle = COOKIE
    text(spec.tagline, 600, 50, POSTER_H - 150, PLUM)
  }

  return new Promise<Blob>((ok, bad) =>
    canvas.toBlob((blob) => (blob ? ok(blob) : bad(new Error('no image'))), 'image/png'),
  )
}

/** Poster for joining a group. */
export function groupPoster(group: {
  name: string
  emoji?: string | null
  color?: string | null
  join_code: string
}, link: string): PosterSpec {
  return {
    eyebrow: 'You’re invited to',
    title: group.name,
    badge: group.emoji || '🍽️',
    badgeColor: group.color,
    caption: 'Scan to join our group',
    sub: `or use code ${group.join_code}`,
    tagline: 'Leave a crumb.',
    link,
    qrLabel: `QR code to join ${group.name} on Crumbs`,
  }
}

/** Poster for joining Crumbs itself. */
export function crumbsPoster(link: string): PosterSpec {
  return {
    eyebrow: 'Your shared food map',
    title: 'Join Crumbs',
    caption: 'Scan to get started',
    sub: 'Rate places together. Decide where to eat.',
    tagline: 'Leave a crumb.',
    link,
    qrLabel: 'QR code to join Crumbs',
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Open the phone's share sheet with the picture (Instagram, Messages, WhatsApp…). Where files can't be
 *  shared (most computers) it saves the picture instead. */
export async function sharePoster(
  blob: Blob,
  name: string,
  text: string,
): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error: any) {
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, name)
  return 'saved'
}
