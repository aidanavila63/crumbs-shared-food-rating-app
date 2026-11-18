import test from 'node:test'
import assert from 'node:assert/strict'
import { nearestSpots } from '../lib/explore.ts'

test('Explore keeps the nearest spots, within reach', () => {
  const c = { lat: 43.65, lng: -79.38 }
  const s = (id: string, dLat: number) => ({ id, latitude: c.lat + dLat, longitude: c.lng })
  const spots = [s('far', 0.1), s('b', 0.005), s('a', 0.001), s('c', 0.009)]
  assert.deepEqual(nearestSpots(spots, c).map((x) => x.id), ['a', 'b', 'c'])
  assert.deepEqual(nearestSpots(spots, c, 2).map((x) => x.id), ['a', 'b'])
  assert.equal(nearestSpots([{ id: 'x', latitude: NaN, longitude: 0 }], c).length, 0)
})
