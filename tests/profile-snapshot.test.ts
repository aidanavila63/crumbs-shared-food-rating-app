import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, dishCandidates, favouriteCandidates } from '../lib/profile-snapshot.ts'

const place = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    name: `Place ${id}`,
    status: 'Been',
    cuisine: 'Thai',
    formatted_address: '1 King St, Toronto, ON M5H, Canada',
    restaurant_id: `rest-${id}`,
    place_visits: [{ id: `v${id}`, visited_on: '2026-03-01' }],
    place_ratings: [{ user_id: 'me', score: 5, points: 90 }],
    dishes: [],
    ...over,
  }) as any

test('snapshot is only counts and short labels', () => {
  const s = buildSnapshot([place('a'), place('b', { cuisine: 'Thai' }), place('c', { status: 'Want to try' })], 'me')
  assert.deepEqual(s.stats, { places: 2, cuisines: 1, cities: 1, visits: 3 })
  assert.deepEqual(s.passport, [{ city: 'Toronto', count: 3 }])
  for (const b of s.badges) assert.ok(b.label && typeof b.key === 'string')
  assert.ok(!JSON.stringify(s).includes('rest-a')) // no ids or private text
})

test('favourites: only rated places linked to a shared restaurant, best first', () => {
  const list = favouriteCandidates(
    [
      place('a', { place_ratings: [{ user_id: 'me', score: 4, points: 70 }] }),
      place('b'),
      place('c', { restaurant_id: null }),
      place('d', { place_ratings: [{ user_id: 'other', score: 5, points: 100 }] }),
    ],
    'me',
  )
  assert.deepEqual(list.map((x) => x.place.id), ['b', 'a'])
  assert.equal(list[0].score, 4.5)
})

test('dishes: only ones I rated', () => {
  const dish = (id: string, user: string, points: number) => ({
    id,
    name: `Dish ${id}`,
    dish_ratings: [{ user_id: user, score: 5, points }],
  })
  const list = dishCandidates([place('a', { dishes: [dish('1', 'me', 80), dish('2', 'me', 95), dish('3', 'x', 99)] })], 'me')
  assert.deepEqual(list.map((x) => x.dish.id), ['2', '1'])
})
