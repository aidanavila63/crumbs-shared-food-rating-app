import test from 'node:test'
import assert from 'node:assert/strict'
import { smartLists } from '../lib/smart-lists.ts'

const place = (over: any = {}): any => ({
  id: Math.random().toString(),
  name: 'Place',
  status: 'Been',
  place_ratings: [],
  place_visits: [],
  ...over,
})
const r = (score: number, user = 'a') => ({ user_id: user, score, notes: null })

test('smart lists sort and filter from ratings and visits', () => {
  const great = place({ name: 'Great', place_ratings: [r(5), r(4, 'b')] })
  const good = place({ name: 'Good', place_ratings: [r(4)] })
  const bad = place({ name: 'Bad', place_ratings: [r(2), r(1, 'b')] })
  const unrated = place({ name: 'Unrated' })
  const wish = place({ name: 'Wish', status: 'Want to try' })
  const regular = place({
    name: 'Regular',
    place_ratings: [r(3)],
    place_visits: [{ id: '1' }, { id: '2' }, { id: '3' }],
  })
  const lists = Object.fromEntries(
    smartLists([great, good, bad, unrated, wish, regular]).map((list) => [
      list.id,
      list.places.map((p) => p.name),
    ]),
  )
  assert.deepEqual(lists.top, ['Great', 'Good'])
  assert.deepEqual(lists.regulars, ['Regular'])
  assert.deepEqual(lists.unrated, ['Unrated'])
  assert.deepEqual(lists.never, ['Bad'])
})
