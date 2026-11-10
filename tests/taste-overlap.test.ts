import test from 'node:test'
import assert from 'node:assert/strict'
import { tasteOverlap, overlapText } from '../lib/taste-overlap.ts'
import type { Place } from '../hooks/use-crumbs-data.ts'

const place = (cuisine: string | null, ratings: [string, number][], draft = false) =>
  ({ cuisine, place_ratings: ratings.map(([user_id, score]) => ({ user_id, score, notes: null, draft })) }) as unknown as Place

test('needs two people who each rate the cuisine highly, one of them you', () => {
  const places = [place('Afghan', [['me', 5], ['maya', 4.5]]), place('Afghan', [['me', 4], ['maya', 5]])]
  const [o] = tasteOverlap(places, 'me')
  assert.equal(o.cuisine, 'Afghan')
  assert.deepEqual(o.who, ['me', 'maya'])
  assert.equal(o.atLeast, 4.5)
  assert.equal(overlapText(o, { maya: 'Maya' }, 'me'), 'You and Maya both rate Afghan 4.5+')
})

test('nothing when only you rated, when scores are low, or when ratings are drafts', () => {
  assert.deepEqual(tasteOverlap([place('Thai', [['me', 5]])], 'me'), [])
  assert.deepEqual(tasteOverlap([place('Thai', [['me', 5], ['maya', 2]])], 'me'), [])
  assert.deepEqual(tasteOverlap([place('Thai', [['me', 5], ['maya', 5]], true)], 'me'), [])
  assert.deepEqual(tasteOverlap([place(null, [['me', 5], ['maya', 5]])], 'me'), [])
})

test('three people read naturally and cuisines merge regardless of case', () => {
  const places = [place('thai', [['me', 4], ['a', 4]]), place('Thai', [['me', 4], ['b', 4.2]])]
  const [o] = tasteOverlap(places, 'me')
  assert.equal(o.who.length, 3)
  assert.equal(overlapText(o, { a: 'Ava', b: 'Ben' }, 'me'), 'You, Ava and Ben all rate thai 4+')
})

test('uses exact points (half stars) and shows 10-point groups their own scale', () => {
  // 4.5 stars is saved as score 5 (rounded) + points 90: overlap must use 90, not 5
  const half = [{ cuisine: 'Thai', place_ratings: [
    { user_id: 'me', score: 5, points: 90, notes: null },
    { user_id: 'maya', score: 5, points: 90, notes: null },
  ] }] as unknown as Place[]
  const [o] = tasteOverlap(half, 'me')
  assert.equal(o.atLeast, 4.5)
  assert.equal(overlapText(o, { maya: 'Maya' }, 'me', '10'), 'You and Maya both rate Thai 9+')
})
