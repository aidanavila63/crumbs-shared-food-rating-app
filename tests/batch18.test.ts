import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hiddenGems, tagLists } from '../lib/smart-lists.ts'
import { bestOfKind, dishKind, rankedKinds } from '../lib/dish-kinds.ts'
import { basedOn } from '../lib/based-on.ts'
import { detailCapText } from '../lib/tiers.ts'

const place = (id: string, scores: number[], extra: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    status: 'Been',
    tags: [],
    place_ratings: scores.map((score, i) => ({ user_id: `u${i}`, score })),
    place_visits: [],
    dishes: [],
    ...extra,
  }) as any

test('hidden gems: 4.3+ and saved by 2 groups or fewer, only once Crumbs has 5 groups', () => {
  const places = [
    place('a', [5, 4], { restaurant_id: 'ra' }),
    place('b', [5, 5], { restaurant_id: 'rb' }),
    place('c', [4, 4], { restaurant_id: 'rc' }),
    place('d', [5, 5]),
  ]
  const saved = { ra: 2, rb: 9, rc: 1 }
  assert.deepEqual(
    hiddenGems(places, { groups: 5, saved }).map((p) => p.id),
    ['a'],
  )
  assert.deepEqual(hiddenGems(places, { groups: 4, saved }), [])
  assert.deepEqual(hiddenGems(places, null), [])
})

test('tag lists appear once two places share a tag', () => {
  const lists = tagLists([
    place('a', [3], { tags: ['Patio'] }),
    place('b', [5], { tags: ['patio', 'Cozy'] }),
    place('c', [4], { tags: ['Cozy'] }),
    place('d', [4], { tags: ['Solo'] }),
  ])
  assert.deepEqual(
    lists.map((l) => [l.id, l.places.map((p) => p.id)]),
    [
      ['tag:patio', ['b', 'a']],
      ['tag:cozy', ['b', 'c']],
    ],
  )
})

test('dish kinds: names and tags, ranked per kind', () => {
  assert.equal(dishKind({ name: 'Spicy Tonkotsu' })?.id, 'ramen')
  assert.equal(dishKind({ name: 'Double smash burger' })?.id, 'burger')
  assert.equal(dishKind({ name: 'House special', tags: ['taco'] })?.id, 'taco')
  assert.equal(dishKind({ name: 'Water' }), null)
  const dish = (name: string, points: number) => ({
    id: name,
    name,
    dish_ratings: [{ user_id: 'u', score: 5, points }],
  })
  const places = [
    place('x', [], { dishes: [dish('Shoyu ramen', 80), dish('Fries', 50)] }),
    place('y', [], { dishes: [dish('Miso ramen', 91)] }),
  ]
  assert.deepEqual(
    rankedKinds(places).map((k) => k.id),
    ['ramen'],
  )
  assert.deepEqual(
    bestOfKind(places, 'ramen').map((r) => [r.dish.name, r.place.id]),
    [
      ['Miso ramen', 'y'],
      ['Shoyu ramen', 'x'],
    ],
  )
})

test('based on: ratings and visits, drafts not counted', () => {
  assert.equal(
    basedOn({
      place_ratings: [{ score: 4 }, { score: 5, draft: true }] as any,
      place_visits: [{}, {}] as any,
    }),
    '1 rating · 2 visits',
  )
  assert.equal(basedOn({ place_ratings: [], place_visits: [] }), null)
})

test('detail caps grow with tier and the top tier is unlimited', () => {
  assert.equal(detailCapText(0), '40 details a day')
  assert.equal(detailCapText(4), 'unlimited details')
})
