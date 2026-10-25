import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchAll } from '../lib/search-all.ts'

test('search everything groups dishes, lists, plans and meals', () => {
  const places = [
    { id: 'p', name: 'Hana Ramen', dishes: [{ id: 'd', name: 'Spicy ramen', tags: [] }] },
  ] as any
  const r = searchAll('ramen', {
    places,
    lists: [{ id: 'l', name: 'Ramen tour' }] as any,
    meals: [{ id: 'm', name: 'Home ramen', notes: null }] as any,
    plans: [{ id: 'x', title: 'Dinner', place_id: 'p', starts_at: null }],
  })!
  assert.equal(r.dishes[0].dish.name, 'Spicy ramen')
  assert.equal(r.lists.length, 1)
  assert.equal(r.plans.length, 1)
  assert.equal(r.meals.length, 1)
  assert.equal(searchAll('r', { places, lists: [], meals: [], plans: [] }), null)
  assert.equal(searchAll('sushi', { places, lists: [], meals: [], plans: [] }), null)
})
