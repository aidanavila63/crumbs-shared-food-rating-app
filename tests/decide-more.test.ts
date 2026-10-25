import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fitsOverlap,
  inArea,
  pickLearning,
  planB,
  threeOptions,
  wheelRotation,
} from '../lib/decide-more.ts'

const place = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    status: 'Been',
    cuisine: null,
    price_level: null,
    latitude: 43.65,
    longitude: -79.38,
    tags: [],
    place_ratings: [],
    opening_hours: null,
    business_status: null,
    ...extra,
  }) as any
const r = (n: number) => [{ user_id: 'u', score: n }]

test('plan B: same cuisine nearby first, skips far, closed and the place itself', () => {
  const ramen = place('ramen', { cuisine: 'Ramen', price_level: 2 })
  const list = [
    ramen,
    place('ramen2', { cuisine: 'Ramen', latitude: 43.66 }),
    place('far', { cuisine: 'Ramen', latitude: 44.5 }),
    place('closed', { cuisine: 'Ramen', business_status: 'CLOSED_PERMANENTLY' }),
    place('loved', { cuisine: 'Thai', place_ratings: r(5) }),
    place('pricey', { cuisine: 'Ramen', price_level: 4 }),
    place('meh', { cuisine: 'Pizza', place_ratings: r(2) }),
  ]
  assert.deepEqual(
    planB(ramen, list).map((x) => x.place.id),
    ['ramen2', 'loved'],
  )
})

test('three options: favourite, something new, wildcard', () => {
  const list = [
    place('fav', { place_ratings: r(5) }),
    place('new', { status: 'Want to try' }),
    place('other'),
  ]
  const three = threeOptions(list, () => 0)
  assert.deepEqual(
    three.map((p) => p.id),
    ['fav', 'new', 'other'],
  )
})

test('private limits overlap', () => {
  const o = { people: 2, max_price: 2, max_km: 3, cravings: ['ramen'] }
  assert.equal(fitsOverlap(place('a', { price_level: 3, cuisine: 'Ramen' }), o, null), false)
  assert.equal(fitsOverlap(place('b', { price_level: 2, cuisine: 'Ramen' }), o, null), true)
  assert.equal(fitsOverlap(place('c', { cuisine: 'Thai' }), o, null), false)
  assert.equal(
    fitsOverlap(place('d', { cuisine: 'Ramen', latitude: 44 }), o, { lat: 43.65, lng: -79.38 }),
    false,
  )
  assert.equal(fitsOverlap(place('e'), null, null), true)
})

test('wheel lands the winner at the top', () => {
  const rot = wheelRotation(0, 2, 4, 5)
  // slice 2 of 4 is centred at 225°; turning 135° more than 5 full turns brings it to 0/360
  assert.equal(rot, 5 * 360 + 135)
  assert.equal((rot + 225) % 360, 0)
})

test('areas and good-pick learning', () => {
  const area = { name: 'Work', lat: 43.65, lng: -79.38, km: 2 }
  assert.equal(inArea(place('x'), area), true)
  assert.equal(inArea(place('y', { latitude: 44 }), area), false)
  const places = [place('a', { cuisine: 'Thai' }), place('b', { cuisine: 'Pizza' })]
  const l = pickLearning(
    [
      { place_id: 'a', good_pick: true },
      { place_id: 'b', good_pick: false },
    ],
    places,
  )
  assert.deepEqual([...l.good], ['Thai'])
  assert.deepEqual([...l.bad], ['Pizza'])
})
