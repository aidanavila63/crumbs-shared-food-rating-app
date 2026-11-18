import test from 'node:test'
import assert from 'node:assert/strict'
import { creditLine, demoVersion, isTwinError } from '../lib/recipe-versions.ts'

test('the credit line names whose recipe it was', () => {
  assert.equal(creditLine('Sunday lasagna', 'Ana'), 'Based on Ana’s Sunday lasagna')
  assert.equal(creditLine('Sunday lasagna', 'you'), 'Based on your Sunday lasagna')
  assert.equal(creditLine('Sunday lasagna', 'someone'), 'Based on someone’s Sunday lasagna')
  assert.equal(creditLine('Sunday lasagna', null), 'Based on someone’s Sunday lasagna')
  assert.equal(creditLine(null, 'Ana'), null)
})

test('the near-copy refusal is recognised', () => {
  assert.ok(isTwinError('This is nearly the same as “Sunday lasagna” by Ana, which is already on Crumbs.'))
  assert.ok(!isTwinError('permission denied'))
  assert.ok(!isTwinError(undefined))
})

test('a demo version is yours, private, unrated and credited', () => {
  const v = demoVersion(
    { id: 'm1', name: 'Stew', created_by: 'ana', recipe_public: true, notes: 'ours', photo_path: 'x.jpg' } as any,
    'my-space',
    'ben',
    new Date('2026-11-18T12:00:00Z'),
  )
  assert.equal(v.group_id, 'my-space')
  assert.equal(v.created_by, 'ben')
  assert.equal(v.recipe_public, false)
  assert.equal(v.notes, null)
  assert.equal(v.photo_path, null)
  assert.deepEqual([v.based_on, v.based_on_name, v.based_on_by], ['m1', 'Stew', 'ana'])
  assert.deepEqual(v.home_meal_ratings, [])
})
