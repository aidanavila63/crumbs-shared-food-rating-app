import test from 'node:test'
import assert from 'node:assert/strict'
import { TIERS, nextTier, pointsFor, tierFor } from '../lib/tiers.ts'

test('tiers follow points', () => {
  assert.equal(tierFor(0).name, 'Taster')
  assert.equal(tierFor(24).level, 0)
  assert.equal(tierFor(25).level, 1)
  assert.equal(tierFor(5000).name, 'Legend')
  assert.deepEqual(nextTier(50), { next: TIERS[2], pct: 33, need: 50 })
  assert.equal(nextTier(2000).next, null)
  assert.equal(pointsFor({ facts: 2, dishes: 5, checks: 3, verified: 1 }), 19)
  // allowances only ever go up
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].limits.ai > TIERS[i - 1].limits.ai)
})
