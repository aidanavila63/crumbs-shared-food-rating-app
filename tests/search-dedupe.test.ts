import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameSearchSpot, streetOf, withoutCrumbsTwins } from '../lib/search-dedupe.ts'

test('streets compare across "St"/"Street" and house numbers', () => {
  assert.equal(streetOf('4848 Yonge St, Toronto'), 'yonge street')
  assert.equal(streetOf('Yonge Street, North York, ON, Canada'), 'yonge street')
  assert.equal(streetOf("4 O'Neill Rd, Toronto"), streetOf("O'Neill Road, North York, ON, Canada"))
  assert.equal(streetOf('Toronto, ON, Canada'), '')
  assert.equal(streetOf(null), '')
})

test('the Nomé Izakaya duplicates are caught', () => {
  const yonge = { name: 'Nome Izakaya', address: '4848 Yonge St, Toronto' }
  const oneill = { name: 'Nome Izakaya', address: "4 O'Neill Rd, Toronto" }
  const g1 = { name: 'Nomé Izakaya North York', address: 'Yonge Street, North York, ON, Canada' }
  const g2 = { name: 'Nomé Izakaya (Don Mills)', address: "O'Neill Road, North York, ON, Canada" }
  assert.ok(sameSearchSpot(yonge, g1))
  assert.ok(sameSearchSpot(oneill, g2))
  // different branches stay different
  assert.ok(!sameSearchSpot(yonge, g2))
  assert.ok(!sameSearchSpot(oneill, g1))
  const kept = withoutCrumbsTwins([g1, g2, { name: 'Kinka Izakaya', address: 'Church Street, Toronto' }], [yonge, oneill], (x) => x)
  assert.deepEqual(kept.map((x) => x.name), ['Kinka Izakaya'])
})

test('different places on one street stay separate', () => {
  assert.ok(!sameSearchSpot({ name: 'Pizza Pizza', address: '10 Queen St W, Toronto' }, { name: 'Pizza Nova', address: 'Queen Street West, Toronto, ON' }))
  assert.ok(!sameSearchSpot({ name: 'Sushi', address: '1 King St, Toronto' }, { name: 'Sushi', address: 'Bay Street, Toronto' }))
  // no street to compare (just a city) → not merged
  assert.ok(!sameSearchSpot({ name: 'Nome Izakaya', address: '4848 Yonge St, Toronto' }, { name: 'Nome Izakaya', address: 'Toronto, ON, Canada' }))
})

test('with pins, 250 m decides', () => {
  const a = { name: 'Café Landwer', address: '1 Front St, Toronto', lat: 43.6455, lng: -79.3807 }
  assert.ok(sameSearchSpot(a, { name: 'Cafe Landwer', address: 'Front Street', lat: 43.6460, lng: -79.3810 }))
  assert.ok(!sameSearchSpot(a, { name: 'Cafe Landwer', address: 'Front Street', lat: 43.66, lng: -79.40 }))
})
