import test from 'node:test'
import assert from 'node:assert/strict'
import { mainLocation, resolveFrom } from '../lib/anchor.ts'

const office = { id: 'a', name: 'Office', lat: 43.65, lng: -79.38, km: 1 }
const campus = { id: 'b', name: 'Campus', lat: 43.66, lng: -79.39, km: 2 }
const home = { lat: 43.6, lng: -79.5 }

test('the main location is the chosen one, else the first', () => {
  assert.equal(mainLocation([office, campus], 'b')?.name, 'Campus')
  assert.equal(mainLocation([office, campus], 'gone')?.name, 'Office')
  assert.equal(mainLocation([], 'b'), null)
})

test('near is measured from the main location unless swapped', () => {
  const opts = { locations: [office, campus], mainId: 'b', mine: [{ name: 'Gym', lat: 1, lng: 2, km: 1 }], home, here: { lat: 9, lng: 9 } }
  assert.equal(resolveFrom('auto', opts)?.label, 'Campus')
  assert.equal(resolveFrom('group:a', opts)?.label, 'Office')
  assert.equal(resolveFrom('me:Gym', opts)?.lat, 1)
  assert.equal(resolveFrom('home', opts)?.label, 'Home')
  assert.equal(resolveFrom('here', opts)?.label, 'Where I am')
  // a swap to something that's gone falls back to the main location
  assert.equal(resolveFrom('group:zzz', opts)?.label, 'Campus')
  // where I am, before the phone knows: nothing yet (the caller waits)
  assert.equal(resolveFrom('here', { ...opts, here: null }), null)
})

test('a group with no locations measures from your Home, as before', () => {
  const opts = { locations: [], mine: [], home, here: null }
  assert.equal(resolveFrom('auto', opts)?.label, 'Home')
  assert.equal(resolveFrom('auto', { ...opts, home: null }), null)
})
