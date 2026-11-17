import test from 'node:test'
import assert from 'node:assert/strict'
import { dishFinderLine } from '../lib/dish-finder.ts'

test('dish finder line: distance, menu source, totals only when given', () => {
  assert.equal(
    dishFinderLine({ distance_km: 0.84, owner_ok: true, confirms: 6, groups: 4, rating: 4.6 }),
    '840 m · ✓ on the owner’s menu · 4.6★ from 4 groups',
  )
  assert.equal(
    dishFinderLine({ distance_km: 2.4, owner_ok: false, confirms: 2, groups: null, rating: null }),
    '2.4 km · confirmed by 2',
  )
  assert.equal(
    dishFinderLine({ distance_km: null, owner_ok: false, confirms: 0, groups: null, rating: null }),
    '',
  )
})
