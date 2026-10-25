import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWrapped, defaultWrappedYear, wrappedYears } from '../lib/wrapped.ts'

const r = (user: string, score: number) => ({ user_id: user, score, notes: null })
const v = (visited_on: string, extra: any = {}) => ({
  id: visited_on + Math.random(),
  place_id: 'x',
  visited_on,
  spend: null,
  ...extra,
})
const place = (
  id: string,
  cuisine: string,
  ratings: any[],
  visits: any[],
  dishes: any[] = [],
): any => ({
  id,
  name: id,
  cuisine,
  status: 'Been',
  place_ratings: ratings,
  place_visits: visits,
  dishes,
})

test('a year in food (#61)', () => {
  const places = [
    place(
      'Hana',
      'Ramen',
      [r('me', 5), r('maya', 4)],
      [
        v('2026-01-06', { spend: 60, people: 2 }),
        v('2026-01-13', { spend: 40, people: 2, kind: 'takeout' }),
        v('2026-03-02', { occasion: 'date' }),
      ],
      [{ id: 'd', name: 'Tonkotsu', dish_ratings: [{ user_id: 'me', score: 5, points: 95 }] }],
    ),
    place(
      'Sol',
      'Mexican',
      [r('me', 3), r('maya', 3)],
      [v('2025-12-01'), v('2026-01-20', { spend: 30 })],
    ),
    place('Old', 'Thai', [r('me', 4)], [v('2024-05-05')]),
  ]
  const meals: any[] = [
    {
      name: 'Lasagna',
      home_meal_cooks: [{ cooked_on: '2026-02-01' }, { cooked_on: '2026-04-01' }],
    },
  ]
  const w = buildWrapped({
    places,
    year: 2026,
    userId: 'me',
    members: [
      { id: 'me', display_name: 'Jordan' },
      { id: 'maya', display_name: 'Maya' },
    ] as any,
    meals,
  })!
  assert.equal(w.visits, 4)
  assert.equal(w.places, 2)
  assert.equal(w.newPlaces, 1) // Sol was first visited in 2025
  assert.deepEqual(w.busiestMonth, { month: 'January', visits: 3 })
  assert.equal(w.spend, 130)
  assert.equal(w.perHead, 25)
  assert.deepEqual(w.topCuisine, { name: 'Ramen', visits: 3 })
  assert.equal(w.regular?.place.id, 'Hana')
  assert.equal(w.favourite?.place.id, 'Hana')
  assert.deepEqual(w.bestDish, { name: 'Tonkotsu', place: 'Hana', points: 95 })
  assert.equal(w.streak, 3) // weeks of Jan 5, 12, 19
  assert.equal(w.takeout, 1)
  assert.equal(w.dates, 1)
  assert.equal(w.homeCooked, 2)
  assert.deepEqual(w.topMeal, { name: 'Lasagna', times: 2 })
  assert.deepEqual(w.you, { rated: 2, average: 4 })
  assert.equal(w.match?.name, 'Maya')
  assert.equal(buildWrapped({ places, year: 2023 }), null)
  assert.deepEqual(wrappedYears(places), [2026, 2025, 2024])
  assert.equal(defaultWrappedYear(places, new Date('2027-01-15')), 2026)
  assert.equal(defaultWrappedYear(places, new Date('2026-10-24')), 2026)
})
