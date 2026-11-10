import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readDishOfWeek } from '../lib/public-page.ts'

const ok = { name: 'Noodles', points: 90, groups: 3, restaurant_id: 'r1', restaurant: 'Spot', city: 'toronto', slug: 'spot', week: '2026-11-02' }

test('dish of the week: reads a good answer', () => {
  assert.deepEqual(readDishOfWeek(ok), { name: 'Noodles', points: 90, groups: 3, restaurant_id: 'r1', restaurant: 'Spot', city: 'toronto', slug: 'spot' })
})

test('dish of the week: never fewer than 3 groups, never junk', () => {
  assert.equal(readDishOfWeek({ ...ok, groups: 2 }), null)
  assert.equal(readDishOfWeek({ ...ok, slug: '' }), null)
  assert.equal(readDishOfWeek(null), null)
  assert.equal(readDishOfWeek({ ...ok, points: 'x' }), null)
  assert.equal(readDishOfWeek({ ...ok, points: 140 })?.points, 100)
})
