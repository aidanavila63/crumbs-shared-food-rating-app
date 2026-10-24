import test from 'node:test'
import assert from 'node:assert/strict'
import { POINTS, TIERS, nextTier, pointsFor, tierFor, tiersWith } from '../lib/tiers.ts'

test('tiers follow points', () => {
  assert.equal(tierFor(0).name, 'Taster')
  assert.equal(tierFor(29).level, 0)
  assert.equal(tierFor(30).level, 1)
  assert.equal(tierFor(5000).name, 'Legend')
  assert.deepEqual(nextTier(65), { next: TIERS[2], pct: 50, need: 35 })
  assert.equal(nextTier(2000).next, null)
  // only details and backed-up details count in the demo estimate
  assert.equal(pointsFor({ facts: 2, verified: 1 }), 6)
  // allowances only ever go up
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].limits.ai > TIERS[i - 1].limits.ai)
})

test('server thresholds win', () => {
  assert.equal(tierFor(45, [40, 120, 300, 700]).level, 1)
  assert.equal(tierFor(35, [40, 120, 300, 700]).level, 0)
  assert.deepEqual(
    tiersWith([40, 120, 300, 700]).map((t) => t.min),
    [0, 40, 120, 300, 700],
  )
})

test('points stay small and expire', () => {
  assert.ok(POINTS.detail <= 2 && POINTS.confirm <= POINTS.detail && POINTS.backed <= 2)
  assert.ok(POINTS.window_days <= 90)
  // a full queue of menu sets is worth less than one tier
  assert.ok(POINTS.menu_queue * (POINTS.menu_try + POINTS.menu_ok) < POINTS.tiers[0])
})
