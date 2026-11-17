import test from 'node:test'
import assert from 'node:assert/strict'
import { isPersonal, orderSpaces, saveTargets, spaceKicker } from '../lib/spaces.ts'
import { withPrivateSpends } from '../lib/private-spend.ts'

const g = (id: string, is_personal = false) => ({ id, is_personal })

test('My Crumbs comes first, groups keep their order', () => {
  assert.deepEqual(
    orderSpaces([g('a'), g('me', true), g('b')]).map((x) => x.id),
    ['me', 'a', 'b'],
  )
  assert.equal(isPersonal(null), false)
  assert.equal(isPersonal(g('me', true)), true)
  assert.match(spaceKicker(g('me', true)), /nobody else/)
  assert.equal(spaceKicker(g('a')), 'Your shared food map')
})

test('Also save to… offers every other space that does not have the place yet', () => {
  const all = [g('a'), g('me', true), g('b'), g('c')]
  assert.deepEqual(
    saveTargets(all, 'a', ['c']).map((x) => x.id),
    ['me', 'b'],
  )
  assert.deepEqual(
    saveTargets(all, 'me', []).map((x) => x.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(saveTargets([g('a')], 'a', []), [])
})

test('your private amounts go back on your own visits only', () => {
  const places = [
    {
      id: 'p1',
      place_visits: [
        { id: 'v1', place_id: 'p1', visited_on: '2026-11-01', spend: null },
        { id: 'v2', place_id: 'p1', visited_on: '2026-11-02', spend: 30 },
        { id: 'v3', place_id: 'p1', visited_on: '2026-11-03', spend: null },
      ],
    },
    { id: 'p2', place_visits: [] },
  ]
  const out = withPrivateSpends(places as any, [
    { visit_id: 'v1', amount: '42.50' },
    { visit_id: 'v2', amount: 99 },
  ])
  assert.deepEqual(
    out[0].place_visits!.map((v) => v.spend),
    [42.5, 30, null],
  )
  assert.equal(out[1], places[1])
  assert.equal(withPrivateSpends(places as any, null), places)
})
