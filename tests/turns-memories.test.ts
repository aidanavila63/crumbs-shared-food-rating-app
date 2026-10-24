import test from 'node:test'
import assert from 'node:assert/strict'
import { whoseTurn } from '../lib/turns.ts'
import { milestones, onThisDay } from '../lib/memories.ts'

test('whose turn picks whoever went longest ago, and never-picked first', () => {
  assert.equal(whoseTurn(['a'], []), null)
  assert.equal(whoseTurn(['a', 'b'], []), null)
  const t = whoseTurn(
    ['a', 'b', 'c'],
    [
      { user: 'a', on: '2026-10-01' },
      { user: 'b', on: '2026-10-05' },
      { user: 'a', on: '2026-10-10' },
    ],
  )
  assert.equal(t?.next, 'c')
  assert.equal(t?.last.user, 'a')
  const u = whoseTurn(
    ['a', 'b'],
    [
      { user: 'a', on: '2026-10-10' },
      { user: 'b', on: '2026-10-05' },
      { user: 'x', on: '2026-10-20' },
    ],
  )
  assert.equal(u?.next, 'b')
})

test('on this day finds last year, and milestones list occasions', () => {
  const place: any = {
    id: 'p',
    name: 'Hana',
    created_at: '2026-01-01T00:00:00Z',
    place_visits: [
      { id: 'v1', visited_on: '2025-10-24', occasion: 'date' },
      { id: 'v2', visited_on: '2026-10-24' },
      { id: 'v3', visited_on: '2024-03-01', milestone: 'First date' },
    ],
  }
  const meal: any = {
    id: 'm',
    name: 'Lasagna',
    home_meal_cooks: [{ id: 'c', cooked_on: '2024-10-22' }],
  }
  const today = new Date('2026-10-24T15:00:00Z')
  const hits = onThisDay([place], [meal], today)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].yearsAgo, 1)
  assert.match(hits[0].text, /for a date/)
  const near = onThisDay([{ ...place, place_visits: [] }], [meal], today)
  assert.equal(near[0].mealId, 'm')
  assert.deepEqual(
    milestones([place]).map((m) => m.visit.id),
    ['v1', 'v3'],
  )
})
