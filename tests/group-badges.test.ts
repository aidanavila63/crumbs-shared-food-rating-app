import test from 'node:test'
import assert from 'node:assert/strict'
import { CRUMBS_BADGES, badgeValue, crumbsBadge } from '../lib/group-badges.ts'
import { oneEmoji } from '../lib/group-look.ts'
import { demoRestaurantFor, DEMO_RESTAURANT } from '../lib/public-demo.ts'

test('Crumbs’ own badges: stored as crumbs:<id>, fit the database limit, text places get a stand-in', () => {
  const ids = CRUMBS_BADGES.map((b) => b.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const b of CRUMBS_BADGES) {
    assert.ok(badgeValue(b.id).length <= 32)
    assert.equal(crumbsBadge(badgeValue(b.id)), b)
    assert.equal(oneEmoji(badgeValue(b.id)), b.stand_in)
    assert.ok(b.paths.length > 0)
  }
  assert.equal(crumbsBadge('crumbs:nope'), null)
  assert.equal(oneEmoji('crumbs:nope'), null)
  assert.equal(crumbsBadge('🍜'), null)
  assert.equal(oneEmoji('🍜'), '🍜')
})

test('demo place pages use the place’s own facts (D8)', () => {
  const other = demoRestaurantFor({
    name: 'Golden Dumpling House',
    cuisine: 'Chinese',
    price_level: 1,
    address: '40 Mission St',
  })
  assert.equal(other.cuisine, 'Chinese')
  assert.equal(other.address, '40 Mission St')
  assert.deepEqual(other.menu, [])
  assert.deepEqual(other.top_dishes, [])
  const same = demoRestaurantFor({ name: 'Pho Place', cuisine: DEMO_RESTAURANT.cuisine })
  assert.ok(same.menu.length > 0)
})
