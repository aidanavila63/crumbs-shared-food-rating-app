// Crumbs-style QR codes (brand guide: claude/brand/crumbs-brand-guide.md → "QR recipe").
// Plum dots on cookie cream, rounded corner squares, a ringed plum circle with the cookie C in the middle and
// a crumb trail carried off the bite, through a clean gap in the ring, out to the top right.
// Error correction H, so the cleared middle and the trail are covered. The trail for every QR size is worked out
// ahead of time (lib/brand-qr-data.ts); the QR library and that data only download when a code is drawn.

export type QrDots = 'liquid' | 'square'

export const QR_CREAM = '#FBF4E8'
export const QR_PLUM = '#7B2D5B'
const COOKIE = '#F2A845'
const CHIPS = '#C9752A'
const SPECKS = '#F9D08A'
const QUIET = 3.4 // quiet zone around the code, in modules
const CLEAR = 0.35 // middle circle = 35% of the code's width
const RING_W = 0.34
const LOGO_MARGIN = 1.2

/** Pure layout for one QR matrix (n×n, dark = 1). Exported for tests. */
export function brandQrFromMatrix(
  n: number,
  dark: (r: number, c: number) => boolean,
  data: typeof import('./brand-qr-data'),
  opts: { dots?: QrDots; size?: number; label?: string } = {},
) {
  const { dots = 'liquid', size = 600, label = 'QR code that opens Crumbs' } = opts
  const cx = n / 2
  const cy = n / 2
  const rad = (n * CLEAR) / 2
  const trail = data.TRAILS[n]
  const off = new Set(trail?.off ?? [])
  const finders = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]
  const inFinder = (r: number, c: number) =>
    finders.some(([fr, fc]) => r >= fr - 1 && r < fr + 8 && c >= fc - 1 && c < fc + 8)
  const cleared = (r: number, c: number) => Math.hypot(r + 0.5 - cy, c + 0.5 - cx) < rad + 0.6
  const on = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < n && c < n && dark(r, c) && !inFinder(r, c) && !cleared(r, c) && !off.has(r * n + c)

  const f = (v: number) => +v.toFixed(3)
  let body = ''
  if (dots === 'liquid') {
    // round dots joined to their right / lower neighbours
    let circles = ''
    let bridges = ''
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!on(r, c)) continue
        circles += `M${c} ${r + 0.5}a.5 .5 0 1 0 1 0a.5 .5 0 1 0-1 0`
        if (on(r, c + 1)) bridges += `M${c + 0.5} ${r}h1v1h-1z`
        if (on(r + 1, c)) bridges += `M${c} ${r + 0.5}h1v1h-1z`
      }
    body += `<path d="${circles}" fill="${QR_PLUM}"/>`
    if (bridges) body += `<path d="${bridges}" fill="${QR_PLUM}"/>`
  } else {
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (on(r, c)) body += `<rect x="${c + 0.08}" y="${r + 0.08}" width=".84" height=".84" rx=".24"/>`
    body = `<g fill="${QR_PLUM}">${body}</g>`
  }
  // corner squares: closed ring + solid centre (both must stay closed to scan)
  for (const [fr, fc] of finders)
    body +=
      `<rect x="${fc + 0.5}" y="${fr + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="${QR_PLUM}" stroke-width="1"/>` +
      `<rect x="${fc + 2}" y="${fr + 2}" width="3" height="3" rx=".9" fill="${QR_PLUM}"/>`

  // ring with a flat-ended gap where the big crumb breaks out
  const rr = rad + 0.15
  if (trail) {
    const [a0, a1] = trail.gap
    const ri = rr - RING_W / 2
    const ro = rr + RING_W / 2
    const span = (((a0 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const large = span > Math.PI ? 1 : 0
    const p = (rad_: number, a: number) => `${f(cx + rad_ * Math.cos(a))} ${f(cy + rad_ * Math.sin(a))}`
    body +=
      `<path d="M${p(ro, a1)}A${f(ro)} ${f(ro)} 0 ${large} 1 ${p(ro, a0)}L${p(ri, a0)}` +
      `A${f(ri)} ${f(ri)} 0 ${large} 0 ${p(ri, a1)}Z" fill="${QR_PLUM}"/>`
  } else {
    body += `<circle cx="${cx}" cy="${cy}" r="${f(rr)}" fill="none" stroke="${QR_PLUM}" stroke-width="${RING_W}"/>`
  }
  // plum plate (always a perfect circle) + the cookie C, centred on the curve of the C
  const plate = rad - 0.55
  body += `<circle cx="${cx}" cy="${cy}" r="${f(plate)}" fill="${QR_PLUM}"/>`
  const w = (plate - LOGO_MARGIN) / data.MARK_REACH
  const m = data.COOKIE_MARK
  body +=
    `<svg x="${f(cx - data.MARK_ARC_X * w)}" y="${f(cy - data.MARK_ARC_Y * w)}" width="${f(w)}" height="${f(w)}" viewBox="${m.vb}">` +
    `<path d="${m.body}" fill="${COOKIE}"/><path d="${m.chips}" fill="${CHIPS}"/><path d="${m.hi}" fill="${SPECKS}"/></svg>`
  if (trail) body += `<path d="${trail.trail}" fill="${COOKIE}"/>`

  const tot = n + 2 * QUIET
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-QUIET} ${-QUIET} ${tot} ${tot}" width="${size}" height="${size}" role="img" aria-label="${label.replace(/[<>&"]/g, '')}">` +
    `<rect x="${-QUIET}" y="${-QUIET}" width="${tot}" height="${tot}" rx="${f(tot * 0.05)}" fill="${QR_CREAM}"/>${body}</svg>`
  )
}

// Error correction H, versions 1–40: blocks and error-correction codewords (from the QR spec).
const H_BLOCKS = [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25]
const H_EC = [17, 28, 44, 64, 88, 112, 130, 156, 192, 224, 264, 308, 352, 384, 432, 480, 532, 588, 650, 700]
/** Keep the covered middle + trail to at most this share of what error correction can fix, in every block,
 *  leaving the rest for a shaky camera, glare or a crumpled poster. (Measured: codes over 1.0 don't scan;
 *  the agreed brand QR sits at ~0.7 and reads down to ~150 px wide.) */
export const DAMAGE_LIMIT = 0.72

type Matrix = { size: number; data: Uint8Array; reservedBit: Uint8Array }

/** How close the logo and trail come to breaking the code: the worst block's wrong codewords ÷ what H can fix.
 *  Follows the standard module order (zig-zag up and down column pairs) and block interleaving. */
export function qrDamage(m: Matrix, version: number, data: typeof import('./brand-qr-data')) {
  const n = m.size
  const t = data.TRAILS[n]
  if (!t || version > H_BLOCKS.length) return 0
  const rad = (n * CLEAR) / 2
  const off = new Set(t.off)
  const darkSeen = new Set(t.dark)
  const covered = (r: number, c: number) =>
    off.has(r * n + c) || Math.hypot(r + 0.5 - n / 2, c + 0.5 - n / 2) < rad + 0.6
  let free = 0
  for (let i = 0; i < n * n; i++) if (!m.reservedBit[i]) free++
  const total = Math.floor(free / 8)
  const wrong = new Uint8Array(total)
  let bit = 0
  let row = n - 1
  let inc = -1
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (;;) {
      for (let k = 0; k < 2; k++) {
        const c = col - k
        const i = row * n + c
        if (m.reservedBit[i]) continue
        const cw = bit >> 3
        bit++
        if (cw < total && covered(row, c) && (darkSeen.has(i) ? 1 : 0) !== m.data[i]) wrong[cw] = 1
      }
      row += inc
      if (row < 0 || row >= n) {
        row -= inc
        inc = -inc
        break
      }
    }
  }
  const blocks = H_BLOCKS[version - 1]
  const ec = H_EC[version - 1]
  const ecPer = ec / blocks
  const dataTotal = total - ec
  const short = Math.floor(dataTotal / blocks)
  const longFrom = blocks - (dataTotal % blocks)
  const order: number[] = []
  for (let i = 0; i < short; i++) for (let b = 0; b < blocks; b++) order.push(b)
  for (let b = longFrom; b < blocks; b++) order.push(b)
  for (let i = 0; i < ecPer; i++) for (let b = 0; b < blocks; b++) order.push(b)
  const perBlock = new Array(blocks).fill(0)
  order.forEach((b, cw) => (perBlock[b] += wrong[cw]))
  return Math.max(...perBlock) / Math.floor(ecPer / 2)
}

/** A Crumbs QR code for `text`, as an SVG string. Tries every mask (and, if needed, a slightly bigger code)
 *  and keeps the one where the logo and trail cover the fewest codewords. */
export async function brandQrSvg(
  text: string,
  opts: { dots?: QrDots; size?: number; label?: string } = {},
) {
  const [QRCode, data] = await Promise.all([import('qrcode'), import('./brand-qr-data')])
  const qr = pickBrandQr(QRCode, text, data)
  const n = qr.modules.size
  return brandQrFromMatrix(n, (r, c) => qr.modules.data[r * n + c] === 1, data, opts)
}

/** Best (version, mask) for the Crumbs look. Exported for tests. */
export function pickBrandQr(
  QRCode: typeof import('qrcode'),
  text: string,
  data: typeof import('./brand-qr-data'),
) {
  const first = QRCode.create(text, { errorCorrectionLevel: 'H' })
  let best = first
  let bestScore = Infinity
  for (let v = first.version; v <= Math.min(first.version + 4, 40); v++) {
    for (let mask = 0; mask < 8; mask++) {
      const qr = QRCode.create(text, {
        errorCorrectionLevel: 'H',
        version: v,
        maskPattern: mask as import('qrcode').QRCodeMaskPattern,
      })
      const score = qrDamage(qr.modules, qr.version, data)
      if (score < bestScore) {
        best = qr
        bestScore = score
      }
    }
    if (bestScore <= DAMAGE_LIMIT) break
  }
  return best
}

/** SVG string → something an <img> or canvas can use. */
export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
