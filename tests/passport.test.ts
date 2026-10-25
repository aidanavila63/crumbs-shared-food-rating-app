import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cityOf, passport } from '../lib/passport.ts'

test('city from an address', () => {
  assert.equal(cityOf('123 Queen St W, Toronto, ON M5H 2N2, Canada'), 'Toronto')
  assert.equal(cityOf('10 Valencia Street, San Francisco, CA 94110, USA'), 'San Francisco')
  assert.equal(cityOf('Rue de Rivoli 1, 75001 Paris, France'), null)
  assert.equal(cityOf('Calle 5, Tulum, Q.R., Mexico'), 'Tulum')
  assert.equal(cityOf('Just a name'), null)
})

test('passport stamps, trips first', () => {
  const place = (id: string, address: string, visits: string[]) =>
    ({
      id,
      name: id,
      status: 'Been',
      formatted_address: address,
      place_visits: visits.map((d) => ({ id: d, visited_on: d })),
      place_ratings: [],
    }) as any
  const stamps = passport(
    [
      place('a', '1 King St, Toronto, ON M5H, Canada', ['2026-01-02', '2026-03-01']),
      place('b', '2 Bay St, Toronto, ON, Canada', ['2026-02-01']),
      place('c', 'somewhere', ['2025-12-01']),
    ],
    [
      {
        id: 'l',
        group_id: 'g',
        name: 'Paris trip',
        emoji: '✈️',
        trip_city: 'Paris',
        list_places: [{ place_id: 'c' }],
      },
    ] as any,
  )
  assert.deepEqual(stamps, [
    { city: 'Paris', first: '2025-12-01', visits: 1, places: 1 },
    { city: 'Toronto', first: '2026-01-02', visits: 3, places: 2 },
  ])
})
