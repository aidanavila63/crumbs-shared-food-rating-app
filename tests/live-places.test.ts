import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePlaces, placeOfChange } from '../lib/live-places.ts'

const places = [
  { id: 'p1', group_id: 'g', pinned: true, created_at: '2026-01-01', dishes: [{ id: 'd1' }] },
  { id: 'p2', group_id: 'g', pinned: false, created_at: '2026-02-01', dishes: [] },
]

test('a change is traced to its place', () => {
  assert.equal(placeOfChange('place_ratings', { new: { place_id: 'p2', user_id: 'u' } }, places), 'p2')
  assert.equal(placeOfChange('place_ratings', { new: {}, old: { place_id: 'p1', user_id: 'u' } }, places), 'p1')
  assert.equal(placeOfChange('dish_ratings', { new: { dish_id: 'd1' } }, places), 'p1')
  assert.equal(placeOfChange('dishes', { new: {}, old: { id: 'd1' } }, places), 'p1')
  assert.equal(placeOfChange('places', { new: { id: 'p9' } }, places), 'p9')
  // a deleted visit only carries its own id: unknown, so the caller reloads the group
  assert.equal(placeOfChange('place_visits', { new: {}, old: { id: 'v1' } }, places), null)
})

test('only the changed place is replaced, in the usual order', () => {
  const fresh = [{ id: 'p2', group_id: 'g', pinned: false, created_at: '2026-02-01', dishes: [], name: 'new' }]
  const next = mergePlaces(places as any[], ['p2'], fresh as any[], 'g')
  assert.deepEqual(next.map((p) => p.id), ['p1', 'p2'])
  assert.equal((next[1] as any).name, 'new')
  // deleted (not found any more): removed
  assert.deepEqual(mergePlaces(places, ['p2'], [], 'g').map((p) => p.id), ['p1'])
  // added by someone else: in, newest first after pinned
  const added = { id: 'p3', group_id: 'g', pinned: false, created_at: '2026-03-01', dishes: [] }
  assert.deepEqual(mergePlaces(places, ['p3'], [added], 'g').map((p) => p.id), ['p1', 'p3', 'p2'])
  // a place in another group (you're in both) is ignored here
  assert.deepEqual(mergePlaces(places, ['p4'], [{ ...added, id: 'p4', group_id: 'other' }], 'g').map((p) => p.id), ['p1', 'p2'])
})
