import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catchUp, isNewMember, tasteProfile } from '../lib/catch-up.ts'
import { goalProgress } from '../lib/goals.ts'

const place = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    status: 'Been',
    cuisine: null,
    place_ratings: [],
    place_visits: [],
    dishes: [],
    ...extra,
  }) as any

test('new member: joined in the last 2 weeks, not the owner', () => {
  const now = new Date('2026-10-25')
  assert.equal(isNewMember({ joined_at: '2026-10-20', role: 'member' }, now), true)
  assert.equal(isNewMember({ joined_at: '2026-09-01', role: 'member' }, now), false)
  assert.equal(isNewMember({ joined_at: '2026-10-24', role: 'owner' }, now), false)
  assert.equal(isNewMember(null, now), false)
})

test('catch-up and taste profile', () => {
  const places = [
    place('a', {
      cuisine: 'Thai',
      place_ratings: [
        { user_id: 'me', score: 5 },
        { user_id: 'you', score: 3 },
      ],
      dishes: [
        { id: 'd', name: 'Khao soi', dish_ratings: [{ user_id: 'me', score: 5, points: 94 }] },
      ],
    }),
    place('b', {
      cuisine: 'Pizza',
      place_ratings: [
        { user_id: 'me', score: 4 },
        { user_id: 'you', score: 3 },
      ],
    }),
    place('c', { status: 'Want to try' }),
  ]
  const c = catchUp(places)
  assert.deepEqual(
    c.favourites.map((p) => p.id),
    ['a'],
  )
  assert.equal(c.dishes[0].dish.name, 'Khao soi')
  assert.equal(c.wishlist, 1)
  const t = tasteProfile(places, 'me')!
  assert.equal(t.style, 'Generous rater')
  assert.deepEqual(t.cuisines, ['Thai', 'Pizza'])
  assert.equal(t.signature?.name, 'Khao soi')
  assert.equal(tasteProfile(places, 'nobody'), null)
})

test('group goal progress', () => {
  const places = [
    place('old', {
      cuisine: 'Thai',
      place_visits: [{ visited_on: '2025-05-01' }, { visited_on: '2026-02-01' }],
    }),
    place('new1', { cuisine: 'Ethiopian', place_visits: [{ visited_on: '2026-03-01' }] }),
    place('new2', { cuisine: 'Thai', place_visits: [{ visited_on: '2026-04-01' }] }),
  ]
  assert.equal(goalProgress('visits', places, [], 2026), 3)
  assert.equal(goalProgress('new_places', places, [], 2026), 2)
  assert.equal(goalProgress('new_cuisines', places, [], 2026), 1)
  assert.equal(
    goalProgress(
      'home_cooks',
      [],
      [{ home_meal_cooks: [{ cooked_on: '2026-01-02' }, { cooked_on: '2025-01-02' }] }],
      2026,
    ),
    1,
  )
})
