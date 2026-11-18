import test from 'node:test'
import assert from 'node:assert/strict'
import { exportName, placesCsv, placesKml } from '../lib/place-export.ts'
import { badgeLine, badgeSnippet, badgeSvg } from '../lib/site-badge.ts'
import { mayDeletePlace } from '../lib/ratings.ts'

const place = (over: Record<string, unknown> = {}) =>
  ({
    id: 'p1', group_id: 'g', name: 'Hana, "Ramen"', status: 'Been', cuisine: 'Ramen', price_level: 2,
    formatted_address: '1 Main St', latitude: 43.65, longitude: -79.38, website: null, google_maps_url: null,
    tags: ['date night'], place_ratings: [{ score: 5, points: null }, { score: 4, points: null }],
    place_visits: [{ visited_on: '2026-11-01' }, { visited_on: '2026-11-10' }], ...over,
  }) as any

test('the spreadsheet: quoted where needed, no formulas, one row a place', () => {
  const csv = placesCsv([place(), place({ name: '=HYPERLINK("x")', latitude: null, longitude: null })])
  const lines = csv.trim().split('\r\n')
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^Name,Status,Cuisine/)
  assert.ok(lines[1].startsWith('"Hana, ""Ramen""",Been,Ramen,$$,4.5,2,2,2026-11-10,date night,1 Main St'))
  assert.ok(lines[2].startsWith(`"'=HYPERLINK(""x"")"`))
  assert.match(lines[1], /,43\.65,-79\.38,/)
  assert.match(placesCsv([place({ name: '-5 Bar' })]), /\n'-5 Bar,/)
})

test('the map file: pins only for places with a location, text escaped', () => {
  const kml = placesKml('Maya & Jordan', [place({ name: 'A <b>' }), place({ id: 'p2', latitude: null })])
  assert.equal((kml.match(/<Placemark>/g) ?? []).length, 1)
  assert.match(kml, /<name>Maya &amp; Jordan<\/name>/)
  assert.match(kml, /<name>A &lt;b&gt;<\/name>/)
  assert.match(kml, /<coordinates>-79.38,43.65,0<\/coordinates>/)
  assert.equal(exportName('Maya & Jordan!', 'csv', new Date('2026-11-18T12:00:00Z')), 'Maya-Jordan-places-2026-11-18.csv')
})

test('website badge: the score only with 3+ groups', () => {
  assert.equal(badgeLine({ rating: null }), null)
  assert.equal(badgeLine({ rating: { avg: 4.44, groups: 2 } as any }), null)
  assert.equal(badgeLine({ rating: { avg: 4.44, groups: 12 } as any }), '★ 4.4 · 12 groups')
  assert.match(badgeSvg({ name: 'A & B', rating: null }), /Find us on Crumbs/)
  assert.match(badgeSvg({ name: 'A & B', rating: null }), /A &amp; B on Crumbs/)
  assert.equal(
    badgeSnippet('https://crumbs.example', '/r/toronto/hana', 'Hana "R"'),
    '<a href="https://crumbs.example/r/toronto/hana" target="_blank" rel="noopener"><img src="https://crumbs.example/r/toronto/hana/badge.svg" alt="Hana &quot;R&quot; on Crumbs" width="220" height="56"></a>',
  )
})

test('who may delete a place', () => {
  const open = { settings: {}, created_by: 'owner' } as any
  const own = { settings: { delete_rule: 'own' }, created_by: 'owner' } as any
  assert.equal(mayDeletePlace(open, { created_by: 'ana' }, 'ben', 'member'), true)
  assert.equal(mayDeletePlace(own, { created_by: 'ana' }, 'ben', 'member'), false)
  assert.equal(mayDeletePlace(own, { created_by: 'ben' }, 'ben', 'member'), true)
  assert.equal(mayDeletePlace(own, { created_by: 'ana' }, 'cal', 'admin'), true)
  assert.equal(mayDeletePlace(own, { created_by: 'ana' }, 'owner', 'member'), true)
  assert.equal(mayDeletePlace(open, { created_by: 'ana' }, undefined, null), false)
})
