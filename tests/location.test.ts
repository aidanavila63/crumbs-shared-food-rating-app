import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownArea, middleOf } from '../lib/location.ts'

test('middleOf ignores places without a pin and resists one far-away trip', () => {
  const toronto = [
    { latitude: 43.65, longitude: -79.38 },
    { latitude: 43.7, longitude: -79.4 },
    { latitude: 43.66, longitude: -79.39 },
    { latitude: -8.65, longitude: 115.2 }, // a trip to Bali
    { latitude: null, longitude: null },
  ]
  const mid = middleOf(toronto)!
  assert.ok(Math.abs(mid.lat - 43.655) < 0.01, `lat ${mid.lat}`)
  assert.ok(Math.abs(mid.lng - -79.385) < 0.01, `lng ${mid.lng}`)
  assert.equal(middleOf([]), null)
  assert.equal(middleOf([{ latitude: null, longitude: 3 }]), null)
})

test('knownArea falls back when nothing is remembered', () => {
  assert.equal(knownArea(), null)
  assert.deepEqual(knownArea({ lat: 1, lng: 2 }), { lat: 1, lng: 2 })
})
