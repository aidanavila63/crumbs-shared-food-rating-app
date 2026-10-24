import test from 'node:test'
import assert from 'node:assert/strict'
import { POINTS, TIERS, nextTier, pointsFor, tierFor } from '../lib/tiers.ts'

test('tiers follow points', () => {
  assert.equal(tierFor(0).name, 'Taster')
  assert.equal(tierFor(24).level, 0)
  assert.equal(tierFor(25).level, 1)
  assert.equal(tierFor(5000).name, 'Legend')
  assert.deepEqual(nextTier(50), { next: TIERS[2], pct: 50, need: 25 })
  assert.equal(nextTier(2000).next, null)
  // only details and backed-up details earn points (dishes and checks don't)
  assert.equal(pointsFor({ facts: 2, verified: 1 }), 6)
  // allowances only ever go up
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].limits.ai > TIERS[i - 1].limits.ai)
})

test('points stay small', () => {
  // a full day of answers can't jump more than one early tier
  assert.ok(POINTS.dailyCap < TIERS[2].min - TIERS[1].min)
  assert.ok(POINTS.detail <= 2 && POINTS.backed <= 2)
})
