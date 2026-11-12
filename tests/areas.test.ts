import test from 'node:test'
import assert from 'node:assert/strict'
import { areaChoices, groupAnchor, privatePlaceNear } from '../lib/areas.ts'

const home = { name: 'Home', lat: 43.65, lng: -79.5, km: 2 }
const office = { id: 'g1', name: 'Office', lat: 43.648, lng: -79.38, km: '1' as unknown as number }

test('a spot within about 100 m of a private place is caught', () => {
  assert.equal(privatePlaceNear({ lat: 43.6504, lng: -79.5003 }, [home])?.name, 'Home')
  assert.equal(privatePlaceNear({ lat: 43.66, lng: -79.5 }, [home]), null)
  assert.equal(privatePlaceNear({ lat: 43.65, lng: -79.5 }, []), null)
})

test('the picker lists the group’s locations first, then your own, with keys that never clash', () => {
  const choices = areaChoices([home, { ...home, name: 'Office' }], [office])
  assert.deepEqual(choices.map((c) => c.key), ['group:g1', 'me:Home', 'me:Office'])
  assert.deepEqual(choices.map((c) => c.shared), [true, false, false])
  assert.equal(choices[0].area.km, 1) // numbers from the database arrive as text
})

test('search starts at the group’s first location when there is one', () => {
  assert.deepEqual(groupAnchor([office]), { lat: 43.648, lng: -79.38 })
  assert.equal(groupAnchor([]), null)
})
