import test from 'node:test'
import assert from 'node:assert/strict'
import { canEditMeal, sharedIn, withSharedMeals } from '../lib/meal-sharing.ts'

const meal = (id: string, created_at: string, extra: Record<string, unknown> = {}) =>
  ({ id, created_at, group_id: 'g', created_by: 'ana', ...extra }) as any

test('shared recipes join the space’s own, newest first, each once', () => {
  const own = [meal('a', '2026-11-03'), meal('b', '2026-11-01')]
  const out = withSharedMeals(own, [
    { home_meals: meal('c', '2026-11-02', { group_id: 'mine' }) },
    { home_meals: meal('a', '2026-11-03') },
    { home_meals: null },
  ])
  assert.deepEqual(
    out.map((m) => m.id),
    ['a', 'c', 'b'],
  )
  assert.equal(withSharedMeals(own, []), own)
  assert.equal(withSharedMeals(own, null), own)
})

test('only whoever added a recipe edits it; an ownerless one, its own space', () => {
  assert.equal(canEditMeal(meal('a', ''), 'ana', 'g'), true)
  assert.equal(canEditMeal(meal('a', ''), 'ben', 'g'), false)
  assert.equal(canEditMeal(meal('a', '', { created_by: null }), 'ben', 'g'), true)
  assert.equal(canEditMeal(meal('a', '', { created_by: null }), 'ben', 'other'), false)
  assert.equal(canEditMeal(meal('a', ''), undefined, 'g'), false)
  assert.equal(sharedIn(meal('a', '', { group_id: 'mine' }), 'g'), true)
  assert.equal(sharedIn(meal('a', ''), 'g'), false)
})
