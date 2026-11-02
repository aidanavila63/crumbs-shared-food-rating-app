import test from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import * as data from '../lib/brand-qr-data.ts'
import { brandQrFromMatrix } from '../lib/brand-qr.ts'

function svgFor(text: string, dots: 'liquid' | 'square' = 'liquid') {
  const { size: n, data: bits } = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules
  return { n, svg: brandQrFromMatrix(n, (r, c) => bits[r * n + c] === 1, data, { dots }) }
}

test('brand QR: invite and poster links get the crumb trail', () => {
  const invite = svgFor('https://crumbs-shared-food-rating-app.vercel.app/?join=AB12CD')
  const poster = svgFor(
    'https://crumbs-shared-food-rating-app-git-big-update-aidanavila63s-projects.vercel.app/?add=9b2f7c1e-3a4d-4f5e-8a9b-0c1d2e3f4a5b',
  )
  for (const { n, svg } of [invite, poster]) {
    assert.ok(data.TRAILS[n], `trail data for ${n}×${n}`)
    assert.ok(svg.includes(data.TRAILS[n].trail), 'trail drawn')
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'))
    assert.ok(svg.includes('#7B2D5B') && svg.includes('#FBF4E8'))
  }
})

test('brand QR: every supported size keeps the corners clear and has a gap in the ring', () => {
  for (const [key, t] of Object.entries(data.TRAILS)) {
    const n = Number(key)
    assert.equal(n % 4, 1, 'QR sizes are 17 + 4×version')
    assert.ok(t.gap[0] < t.gap[1], 'gap runs a0 → a1')
    for (const i of t.off) {
      const r = Math.floor(i / n)
      const c = i % n
      const inFinder = [[0, 0], [0, n - 7], [n - 7, 0]].some(
        ([fr, fc]) => r >= fr - 1 && r < fr + 8 && c >= fc - 1 && c < fc + 8,
      )
      assert.ok(!inFinder, `trail never touches a corner square (${n}: ${r},${c})`)
    }
  }
})

test('brand QR: square dots and very long text still render', () => {
  assert.ok(svgFor('https://example.com/?join=XYZ', 'square').svg.includes('rx=".24"'))
  const long = svgFor('x'.repeat(400))
  assert.ok(!data.TRAILS[long.n], 'no precomputed trail this big')
  assert.ok(long.svg.includes('<circle'), 'falls back to a full ring')
})
