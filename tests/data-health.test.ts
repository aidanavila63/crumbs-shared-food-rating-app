import test from 'node:test'
import assert from 'node:assert/strict'
import { filledPct, sourceSplit } from '../lib/data-health.ts'

const row = { fact: 'hours', total: 20, filled: 10, owner: 1, crumbs: 2, site: 3, osm: 4, google: 0 }

test('filledPct rounds and handles no restaurants', () => {
  assert.equal(filledPct(row), 50)
  assert.equal(filledPct({ total: 0, filled: 0 }), 0)
  assert.equal(filledPct({ total: 3, filled: 1 }), 33)
})

test('sourceSplit leaves out empty sources and works as percent of filled', () => {
  const s = sourceSplit(row)
  assert.deepEqual(s.map((x) => x.label), ['Owner', 'Members', 'Website', 'OpenStreetMap'])
  assert.equal(s.find((x) => x.label === 'OpenStreetMap')?.pct, 40)
  assert.deepEqual(sourceSplit({ ...row, filled: 0, owner: 0, crumbs: 0, site: 0, osm: 0 }), [])
})

import { differsFromPage, type Restaurant } from '../lib/restaurants.ts'
const place = {
  opening_hours: { utc: 0, periods: [{ o: [1, 9, 0], c: [1, 17, 0] }] },
  phone: '(416) 555-0100',
  website: 'https://a.example/',
  cuisine: 'Afghan',
  price_level: 2,
} as unknown as Restaurant

test('differsFromPage notices real disagreement but not gaps or formatting', () => {
  assert.equal(differsFromPage(place, 'phone', '416-555-0100'), false)
  assert.equal(differsFromPage(place, 'phone', '416-555-0199'), true)
  assert.equal(differsFromPage(place, 'website', 'https://a.example'), false)
  assert.equal(differsFromPage(place, 'cuisine', 'Afghan'), false)
  assert.equal(differsFromPage(place, 'price_level', 3), true)
  assert.equal(differsFromPage(place, 'hours', { utc: 0, periods: [{ o: [1, 10, 0], c: [1, 17, 0] }] }), true)
  assert.equal(differsFromPage(place, 'hours', place.opening_hours), false)
  assert.equal(differsFromPage({ ...place, phone: null } as Restaurant, 'phone', '416-555-0199'), false)
  assert.equal(differsFromPage(null, 'phone', '1'), false)
})
