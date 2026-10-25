import { test } from 'node:test'
import assert from 'node:assert/strict'
import { busyText, mealTimeAt, ratingFromVisits, ratingRow, waitText } from '../lib/visit-rating.ts'

test('rating from visits: recent visits count more, only yours', () => {
  const now = new Date('2026-10-25T12:00:00')
  const visits = [
    { visited_on: '2025-10-25', score: 2, created_by: 'me' },
    { visited_on: '2026-10-25', score: 5, created_by: 'me' },
    { visited_on: '2026-10-20', score: 1, created_by: 'you' },
    { visited_on: '2026-09-01', score: null, created_by: 'me' },
  ]
  const r = ratingFromVisits(visits, 'me', now)!
  assert.equal(r.count, 2)
  // a year old = quarter weight: (2*0.25 + 5) / 1.25 ≈ 4.4
  assert.ok(Math.abs(r.value - 4.4) < 0.01)
  assert.deepEqual(ratingRow(r.value), { points: 88, score: 4 })
  assert.equal(ratingFromVisits(visits, 'nobody', now), null)
})

test('meal time from the clock', () => {
  assert.equal(mealTimeAt(new Date('2026-10-25T08:00:00')), 'breakfast')
  assert.equal(mealTimeAt(new Date('2026-10-25T12:30:00')), 'lunch')
  assert.equal(mealTimeAt(new Date('2026-10-25T19:00:00')), 'dinner')
  assert.equal(mealTimeAt(new Date('2026-10-25T23:30:00')), 'late')
})

test('busy text and wait text', () => {
  assert.equal(
    busyText([
      { dow: 6, meal: 'dinner', n: 9 },
      { dow: 5, meal: 'dinner', n: 7 },
      { dow: 0, meal: 'lunch', n: 6 },
    ]),
    'Usually busy Fri–Sat evenings',
  )
  assert.equal(busyText([{ dow: 0, meal: 'lunch', n: 3 }]), 'Usually busy Sun lunchtimes')
  assert.equal(busyText(null), null)
  assert.equal(waitText(0), 'Usually no wait')
  assert.equal(waitText(15), 'Usual wait ~15 min')
})
