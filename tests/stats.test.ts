import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allVisits,
  bestDishes,
  cuisineBingo,
  dishPoints,
  onThisDay,
  surprisePool,
  tasteMatch,
  yearInReview,
} from '../lib/stats.ts'
import { isMapsHost, parseMapsUrl } from '../lib/maps-link.ts'

const place = (over: any = {}): any => ({
  id: Math.random().toString(),
  name: 'Place',
  status: 'Been',
  cuisine: null,
  price_level: null,
  pinned: false,
  latitude: null,
  longitude: null,
  tags: [],
  place_ratings: [],
  dishes: [],
  place_visits: [],
  ...over,
})

test('old star ratings count as 20 points each', () => {
  assert.equal(dishPoints({ score: 4 }), 80)
  assert.equal(dishPoints({ score: 4, points: 93 }), 93)
})

test('best dishes ranks by average points', () => {
  const dishes = [
    {
      id: 'a',
      name: 'Naan',
      dish_ratings: [
        { user_id: 'x', score: 5, points: 90 },
        { user_id: 'y', score: 4, points: 80 },
      ],
    },
    { id: 'b', name: 'Soup', dish_ratings: [{ user_id: 'x', score: 5 }] },
    { id: 'c', name: 'Unrated', dish_ratings: [] },
  ]
  const rows = bestDishes([place({ dishes })])
  assert.deepEqual(
    rows.map((row) => [row.dish.name, row.points]),
    [
      ['Soup', 100],
      ['Naan', 85],
    ],
  )
})

test('taste match is 100 when you agree and drops with distance', () => {
  const ratings = (a: number, b: number) => [
    { user_id: 'a', score: a, notes: null },
    { user_id: 'b', score: b, notes: null },
  ]
  assert.equal(tasteMatch([place({ place_ratings: ratings(4, 4) })], 'a', 'b')?.percent, 100)
  assert.equal(tasteMatch([place({ place_ratings: ratings(5, 1) })], 'a', 'b')?.percent, 0)
  assert.equal(tasteMatch([place()], 'a', 'b'), null)
})

test('bingo only counts places you have been to', () => {
  const bingo = cuisineBingo([
    place({ cuisine: 'Italian' }),
    place({ cuisine: 'Mexican' }),
    place({ cuisine: 'Thai', status: 'Want to try' }),
  ])
  assert.equal(bingo.filled, 2)
  assert.equal(bingo.done[5], false)
})

test('visits fall back to the old single date and feed the year review', () => {
  const places = [
    place({ name: 'A', cuisine: 'Thai', visited_on: '2026-03-01' }),
    place({
      name: 'B',
      cuisine: 'Thai',
      place_visits: [
        { id: '1', place_id: 'b', visited_on: '2026-05-02', spend: 40 },
        { id: '2', place_id: 'b', visited_on: '2026-06-02', spend: 35.5 },
      ],
    }),
  ]
  assert.equal(allVisits(places).length, 3)
  const review = yearInReview(places, 2026)
  assert.equal(review?.visits, 3)
  assert.equal(review?.spend, 75.5)
  assert.deepEqual(review?.topCuisine, ['Thai', 3])
  assert.equal(yearInReview(places, 2020), null)
})

test('on this day finds earlier years only', () => {
  const places = [
    place({
      place_visits: [
        { id: '1', place_id: 'x', visited_on: '2025-10-23', spend: null },
        { id: '2', place_id: 'x', visited_on: '2026-10-23', spend: null },
      ],
    }),
  ]
  assert.deepEqual(
    onThisDay(places, new Date(2026, 9, 23)).map((row) => row.yearsAgo),
    [1],
  )
})

test('surprise only draws from want-to-try places that match', () => {
  const places = [
    place({ name: 'Been', status: 'Been', cuisine: 'Thai' }),
    place({ name: 'Cheap thai', status: 'Want to try', cuisine: 'Thai', price_level: 1 }),
    place({ name: 'Fancy thai', status: 'Want to try', cuisine: 'Thai', price_level: 4 }),
    place({ name: 'Pizza', status: 'Want to try', cuisine: 'Pizza', pinned: true }),
  ]
  const none = { cuisine: null, maxPrice: null, pinnedOnly: false, nearMe: null }
  assert.equal(surprisePool(places, none).length, 3)
  assert.deepEqual(
    surprisePool(places, { ...none, cuisine: 'Thai', maxPrice: 2 }).map((p) => p.name),
    ['Cheap thai'],
  )
  assert.deepEqual(
    surprisePool(places, { ...none, pinnedOnly: true }).map((p) => p.name),
    ['Pizza'],
  )
})

test('reads names and pins out of Google Maps links', () => {
  const parsed = parseMapsUrl(
    'https://www.google.com/maps/place/Naan+Kabob/@43.65,-79.64,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d43.6512!4d-79.6401',
  )
  assert.equal(parsed?.name, 'Naan Kabob')
  assert.equal(parsed?.lat, 43.6512)
  assert.equal(parseMapsUrl('https://www.google.com/maps/@43.6,-79.6,15z'), null)
  assert.equal(isMapsHost('maps.app.goo.gl', '/abc'), true)
  assert.equal(isMapsHost('evil.com', '/maps/place/x'), false)
  assert.equal(isMapsHost('google.com.evil.com', '/maps'), false)
})
