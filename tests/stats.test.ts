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

import { dishWarnings, hoursFromGoogle, maskRatings, mergeMasked, openStatus, placeWarnings, tonightPick } from '../lib/place-info.ts'
import { monthlyChallenges, tripSummary, visitStreak } from '../lib/goals.ts'

const mon9to5 = { utc: 0, periods: [1, 2, 3, 4, 5].map((d) => ({ o: [d, 9, 0] as [number, number, number], c: [d, 17, 0] as [number, number, number] })) }

test('open now: inside, outside, and across midnight', () => {
  assert.equal(openStatus(mon9to5, new Date('2026-10-26T12:00:00Z'))?.open, true) // Monday noon
  assert.equal(openStatus(mon9to5, new Date('2026-10-26T12:00:00Z'))?.text, 'Open · closes 5 PM')
  assert.equal(openStatus(mon9to5, new Date('2026-10-24T12:00:00Z'))?.text, 'Closed · opens Mon 9 AM') // Saturday
  const late = { utc: 0, periods: [{ o: [5, 18, 0] as [number, number, number], c: [6, 2, 0] as [number, number, number] }] }
  assert.equal(openStatus(late, new Date('2026-10-24T01:00:00Z'))?.open, true) // Saturday 1am, bar open from Friday
  assert.equal(openStatus(late, new Date('2026-10-24T05:00:00Z'))?.open, false)
  assert.equal(openStatus(null), null)
})

test('opening hours use the place’s own time zone', () => {
  const tokyo = { ...mon9to5, utc: 540 }
  assert.equal(openStatus(tokyo, new Date('2026-10-26T01:00:00Z'))?.open, true) // 10:00 in Tokyo
})

test('google hours are shrunk to the cached shape', () => {
  const hours = hoursFromGoogle({ utcOffsetMinutes: -240, regularOpeningHours: { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] } })
  assert.deepEqual(hours, { utc: -240, periods: [{ o: [1, 9, 0], c: [1, 17, 0] }] })
  assert.equal(hoursFromGoogle({}), null)
})

test('dealbreaker warnings name who they bother', () => {
  const people = [{ display_name: 'Maya Lee', avoid: ['loud', 'a:shellfish'] }, { display_name: 'Jo', avoid: [] }]
  const facts: any = { noise: 'loud', parking: 'easy', accessible: null, wait: null, cash_only: false, allergens: ['Shellfish'] }
  assert.deepEqual(placeWarnings(facts, people), [{ label: 'Loud', who: ['Maya'] }, { label: 'Shellfish', who: ['Maya'] }])
  assert.deepEqual(placeWarnings(null, people), [])
  assert.deepEqual(dishWarnings({ tags: ['Shellfish', 'spicy'] }, people), [{ label: 'Shellfish', who: ['Maya'] }])
})

test('blind ratings hide partner scores until you rate, and merge back safely', () => {
  const rated = (id: string, ...users: string[]): any =>
    place({ id, place_ratings: users.map((u) => ({ user_id: u, score: 4, notes: null })), dishes: [{ id: 'd' + id, dish_ratings: users.map((u) => ({ user_id: u, score: 4 })) }] })
  const masked = maskRatings([rated('1', 'them'), rated('2', 'me', 'them')], 'me')
  assert.equal(masked[0].place_ratings.length, 0)
  assert.equal(masked[0].dishes![0].dish_ratings.length, 0)
  assert.equal(masked[1].place_ratings.length, 2)
  const real = rated('1', 'them')
  const merged = mergeMasked(real, { ...masked[0], place_ratings: [{ user_id: 'me', score: 5, notes: null }] }, 'me')
  assert.equal(merged.place_ratings.length, 2)
  assert.equal(merged.dishes![0].dish_ratings.length, 1)
})

test('tonight skips closed, dealbreaker and visited places', () => {
  const people = [{ display_name: 'Maya', avoid: ['loud'] }]
  const avg = () => 0
  const places = [
    place({ id: 'a', name: 'Loud', status: 'Want to try', place_facts: { noise: 'loud', allergens: [], cash_only: false } }),
    place({ id: 'b', name: 'Gone', status: 'Want to try', business_status: 'CLOSED_PERMANENTLY' }),
    place({ id: 'c', name: 'Shut', status: 'Want to try', opening_hours: mon9to5 }),
    place({ id: 'd', name: 'Fine', status: 'Want to try' }),
  ]
  assert.equal(tonightPick(places, people, avg, new Date('2026-10-24T22:00:00Z'))?.place.name, 'Fine')
  assert.equal(tonightPick([places[0]], people, avg), null)
})

test('streak counts weeks in a row and challenges count this month', () => {
  const v = (d: string) => ({ id: d, place_id: 'x', visited_on: d, spend: null })
  const places = [place({ cuisine: 'Thai', created_at: '2026-01-01', place_visits: [v('2026-10-05'), v('2026-10-14'), v('2026-10-21')] })]
  const streak = visitStreak(places, new Date(2026, 9, 22))
  assert.equal(streak.current, 3)
  assert.equal(streak.best, 3)
  const done = Object.fromEntries(monthlyChallenges(places, new Date(2026, 9, 22)).map((c) => [c.id, c.done]))
  assert.equal(done.visits, 3)
  assert.equal(done.places, 1) // first visit was 5 Oct
  assert.equal(done.wishlist, 1) // added in January, first visited in October
})

test('trip summary counts only visits inside the trip dates', () => {
  const v = (d: string, spend: number) => ({ id: d, place_id: 'x', visited_on: d, spend })
  const inTrip = place({ id: 'x', status: 'Been', place_visits: [v('2026-11-02', 40), v('2026-09-01', 99)] })
  const list: any = { id: 'l', group_id: 'g', name: 'Lisbon', emoji: '✈️', starts_on: '2026-11-01', ends_on: '2026-11-05', list_places: [{ place_id: 'x' }, { place_id: 'y' }] }
  const summary = tripSummary(list, [inTrip, place({ id: 'y' })], new Date(2026, 10, 3))
  assert.deepEqual({ ...summary }, { total: 2, visited: 1, spend: 40, when: 'Day 3 of 5' })
  assert.equal(tripSummary(list, [], new Date(2026, 9, 29)).when, '3 days to go')
  assert.equal(tripSummary(list, [], new Date(2026, 11, 1)).when, 'Trip finished')
})
