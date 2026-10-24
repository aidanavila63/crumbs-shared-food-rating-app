import test from 'node:test'
import assert from 'node:assert/strict'
import { lovedToTry, osmCuisine, overpassQuery, overpassToPlaces } from '../lib/nearby.ts'

const p = (id: string, extra: any = {}): any => ({
  id,
  name: id,
  status: 'Been',
  cuisine: 'Ramen',
  latitude: 43.65,
  longitude: -79.38,
  place_ratings: [],
  tags: [],
  ...extra,
})

test('loved to try matches cuisine and sorts by distance', () => {
  const loved = p('loved', { place_ratings: [{ user_id: 'a', score: 5, notes: null }] })
  const near = p('near', { status: 'Want to try', latitude: 43.651 })
  const far = p('far', { status: 'Want to try', latitude: 43.7 })
  const other = p('thai', { status: 'Want to try', cuisine: 'Thai' })
  const meh = p('meh', {
    cuisine: 'Thai',
    place_ratings: [{ user_id: 'a', score: 3, notes: null }],
  })
  const recs = lovedToTry([loved, near, far, other, meh])
  assert.equal(recs.length, 1)
  assert.deepEqual(
    recs[0].tries.map((t) => t.place.id),
    ['near', 'far'],
  )
})

test('overpass helpers', () => {
  assert.equal(osmCuisine('Middle Eastern'), 'middle_eastern')
  assert.equal(osmCuisine('Thai restaurant'), 'thai')
  const q = overpassQuery(43.123456, -79.5, 'Ramen')
  assert.match(q, /around:2000,43.12346,-79.50000/)
  assert.match(q, /\(\^\|;\)ramen\(\$\|;\)/)
  const places = overpassToPlaces({
    elements: [
      {
        type: 'node',
        id: 1,
        lat: 1,
        lon: 2,
        tags: {
          name: 'Ramen Ya',
          cuisine: 'ramen;japanese',
          'addr:street': 'King St',
          'addr:housenumber': '5',
          website: 'javascript:alert(1)',
        },
      },
      { type: 'way', id: 2, center: { lat: 3, lon: 4 }, tags: { name: 'Noodle Bar' } },
      { type: 'node', id: 3, lat: 1, lon: 2, tags: {} },
    ],
  }) as any[]
  assert.equal(places.length, 2)
  assert.equal(places[0].google_place_id, 'osm:N1')
  assert.equal(places[0].cuisine, 'Ramen')
  assert.equal(places[0].formatted_address, '5 King St')
  assert.equal(places[0].website, null)
  assert.equal(places[1].google_place_id, 'osm:W2')
})
