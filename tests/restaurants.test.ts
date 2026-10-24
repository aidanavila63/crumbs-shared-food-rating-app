import test from 'node:test'
import assert from 'node:assert/strict'
import { dishKey, missingFromOurs, priceAge, shareable, sortMenu } from '../lib/restaurants.ts'

test('dish keys collate spelling and punctuation like the database', () => {
  assert.equal(dishKey('  TONKOTSU  ramen! '), 'tonkotsu ramen')
  assert.equal(dishKey('Pork-Gyoza (6)'), 'pork gyoza 6')
  assert.equal(shareable('manual:1'), false)
  assert.equal(shareable('osm:N1'), true)
})

test('menu helpers', () => {
  const d = (name: string, course: any, confirms: number): any => ({
    name,
    name_key: dishKey(name),
    course,
    confirms,
  })
  const menu = sortMenu([
    d('Mochi', 'dessert', 1),
    d('Ramen', 'main', 1),
    d('Gyoza', 'starter', 0),
    d('Tea', null, 5),
    d('Udon', 'main', 3),
  ])
  assert.deepEqual(
    menu.map((m) => m.name),
    ['Gyoza', 'Udon', 'Ramen', 'Mochi', 'Tea'],
  )
  assert.deepEqual(
    missingFromOurs(menu, [{ name: 'ramen' }, { name: 'GYOZA' }]).map((m) => m.name),
    ['Udon', 'Mochi', 'Tea'],
  )
  const now = new Date('2026-10-24T12:00:00Z')
  assert.equal(priceAge('2026-10-24T08:00:00Z', now), 'today')
  assert.equal(priceAge('2026-10-14T08:00:00Z', now), '10 days ago')
  assert.equal(priceAge('2026-06-01T08:00:00Z', now), '4 months ago')
  assert.equal(priceAge('2024-06-01T08:00:00Z', now), '2 years ago')
})

test('owned share counts member + open data, not Google', async () => {
  const { ownedShare, needsHelp } = await import('../lib/restaurants.ts')
  const r: any = {
    formatted_address: '1 Main',
    opening_hours: { utc: 0, periods: [] },
    phone: '555',
    website: null,
    price_level: 2,
    cuisine: 'Thai',
    business_status: 'OPERATIONAL',
    sources: {
      address: 'osm',
      hours: 'crumbs',
      phone: 'google',
      price_level: 'google',
      cuisine: 'crumbs',
      status: 'google',
    },
  }
  assert.equal(ownedShare(r), 43) // 3 of 7
  assert.deepEqual(needsHelp(r), ['phone', 'website', 'price_level', 'status'])
})
