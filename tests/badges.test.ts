import test from 'node:test'
import assert from 'node:assert/strict'
import { badges } from '../lib/badges.ts'

const place = (over: any = {}): any => ({
  id: Math.random().toString(),
  name: 'Place',
  status: 'Been',
  cuisine: null,
  tags: [],
  place_ratings: [],
  dishes: [],
  place_visits: [],
  ...over,
})
const visit = (id: string, date: string) => ({
  id: `${id}-${date}`,
  place_id: id,
  visited_on: date,
  spend: null,
})

test('no data earns nothing', () => {
  const list = badges([], 'me')
  assert.ok(list.length > 0)
  assert.ok(list.every((badge) => !badge.earned && badge.progress === 0))
})

test('first visit and regular badges come from visits', () => {
  const p = place({
    id: 'p1',
    place_visits: [visit('p1', '2026-10-01'), visit('p1', '2026-10-08'), visit('p1', '2026-10-15')],
  })
  const list = badges([p], 'me', new Date('2026-10-20T12:00:00'))
  const byId = Object.fromEntries(list.map((badge) => [badge.id, badge]))
  assert.equal(byId['first-bite'].earned, true)
  assert.equal(byId['regular'].earned, true)
  assert.equal(byId['explorer'].progress, 1)
})

test('globetrotter counts distinct cuisines you have been to, ignoring case', () => {
  const places = ['Thai', 'thai', 'Ramen', 'Pizza'].map((cuisine) => place({ cuisine }))
  places.push(place({ cuisine: 'Tacos', status: 'Want to try' }))
  const g = badges(places, 'me').find((badge) => badge.id === 'globetrotter')!
  assert.equal(g.progress, 3)
  assert.equal(g.earned, false)
})

test('critic only counts your own ratings and caps progress at the target', () => {
  const places = Array.from({ length: 30 }, () =>
    place({ place_ratings: [{ user_id: 'me', score: 4, notes: null }] }),
  )
  places.push(place({ place_ratings: [{ user_id: 'them', score: 2, notes: null }] }))
  const c = badges(places, 'me').find((badge) => badge.id === 'critic')!
  assert.equal(c.progress, 25)
  assert.equal(c.earned, true)
})
