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
  assert.equal(lists.never, undefined) // removed (Aidan, Oct 25)
})

test('been a while (#33)', async () => {
  const { beenAWhile, lastVisit, sinceText } = await import('../lib/smart-lists.ts')
  const now = new Date('2026-10-24')
  const p = (name: string, score: number, days: string[], status = 'Been'): any => ({
    id: name,
    name,
    status,
    visited_on: null,
    place_ratings: [{ user_id: 'a', score, notes: null }],
    place_visits: days.map((visited_on) => ({ visited_on })),
  })
  const places = [
    p('Old fave', 5, ['2026-01-10', '2026-03-01']),
    p('Older fave', 4, ['2025-08-01']),
    p('Recent', 5, ['2026-10-01']),
    p('Meh', 2, ['2025-01-01']),
    p('Wish', 5, [], 'Want to try'),
  ]
  assert.equal(lastVisit(places[0]), '2026-03-01')
  assert.deepEqual(
    beenAWhile(places, 90, now).map((x) => x.place.name),
    ['Older fave', 'Old fave'],
  )
  assert.equal(sinceText('2026-03-01', now), '7 months ago')
  assert.equal(sinceText('2025-08-01', now), '1 year ago')
})
