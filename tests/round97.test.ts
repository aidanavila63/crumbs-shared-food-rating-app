import test from 'node:test'
import assert from 'node:assert/strict'
import { dishExtras, menuGroups } from '../lib/public-page.ts'

const dish = (name: string, over: Record<string, unknown> = {}) =>
  ({ name, price: 10, course: 'main', dietary: null, description: null, claimed: true, ...over }) as any

test('more than one menu: the main one first, then the others A–Z, each by course', () => {
  const groups = menuGroups([
    dish('Latte', { menu_name: 'Drinks', course: 'drink' }),
    dish('Burger'),
    dish('Benny', { menu_name: 'Brunch' }),
    dish('Fries', { course: 'side' }),
  ])
  assert.deepEqual(groups.map((g) => g.menu), [null, 'Brunch', 'Drinks'])
  assert.deepEqual(groups[0].sections.map((s) => s.course), ['main', 'side'])
  assert.equal(menuGroups([]).length, 0)
})

test('the little line under a dish', () => {
  assert.equal(dishExtras({ served: ['lunch', 'dinner'], until: null }), 'Lunch · Dinner')
  assert.equal(dishExtras({ served: ['breakfast', 'lunch', 'dinner', 'late'], until: null }), '')
  assert.equal(dishExtras({ served: null, until: '2026-12-08' }), 'Until Dec 8')
  assert.equal(dishExtras({ served: ['late'], until: '2026-12-08' }), 'Late night · Until Dec 8')
})
