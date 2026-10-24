import test from 'node:test'
import assert from 'node:assert/strict'
import {
  average5,
  balancedAverage,
  categoryAverages,
  formatScore,
  fromInput,
  inputValue,
  overallFromCategories,
  raterOffsets,
  settingsOf,
} from '../lib/ratings.ts'

test('settings fall back to sensible defaults', () => {
  const s = settingsOf(null)
  assert.equal(s.scale, '5')
  assert.equal(s.categories, false)
  assert.equal(s.wouldReturn, true)
  assert.equal(s.home, true)
  assert.ok(s.tags.length > 3)
  assert.equal(settingsOf({ settings: { scale: '10', home: false } }).home, false)
})

test('scales round-trip through points', () => {
  assert.deepEqual(fromInput(4, '5'), { points: 80, score: 4 })
  assert.deepEqual(fromInput(3.5, 'half'), { points: 70, score: 4 })
  assert.deepEqual(fromInput(7, '10'), { points: 70, score: 4 })
  assert.equal(inputValue({ score: 4, points: 70 }, 'half'), 3.5)
  assert.equal(inputValue({ score: 4, points: 70 }, '10'), 7)
  assert.equal(inputValue({ score: 4, points: null }, '10'), 8)
  assert.equal(inputValue(undefined, '5'), 0)
})

test('averages use exact points and format per scale', () => {
  const avg = average5([
    { score: 4, points: 70 },
    { score: 5, points: null },
  ])
  assert.equal(avg, 4.25)
  assert.equal(formatScore(avg, '5'), '4.3')
  assert.equal(formatScore(avg, '10'), '8.5')
  assert.equal(formatScore(0, '5'), '—')
})

test('category averages and overall from categories', () => {
  const ratings: any[] = [
    { user_id: 'a', score: 4, notes: null, food: 5, service: 3 },
    { user_id: 'b', score: 4, notes: null, food: 4, vibe: 4 },
  ]
  const avg = categoryAverages(ratings)
  assert.equal(avg.food, 4.5)
  assert.equal(avg.service, 3)
  assert.equal(avg.value, null)
  assert.equal(overallFromCategories({ food: 5, service: 4, vibe: 4 }), 4.5)
  assert.equal(overallFromCategories({}), null)
})

test('balanced score lifts a tough rater and tempers a generous one', () => {
  const r = (user: string, score: number) => ({ user_id: user, score, notes: null })
  const places: any[] = [
    { place_ratings: [r('tough', 2), r('easy', 5)] },
    { place_ratings: [r('tough', 3), r('easy', 5)] },
    { place_ratings: [r('tough', 2), r('easy', 4)] },
  ]
  const offsets = raterOffsets(places)
  assert.ok(offsets.tough > 0)
  assert.ok(offsets.easy < 0)
  const plain = average5([r('tough', 4), r('easy', 4)])
  const balanced = balancedAverage([r('tough', 4)], offsets)
  assert.ok(balanced > 4)
  assert.equal(plain, 4)
})
