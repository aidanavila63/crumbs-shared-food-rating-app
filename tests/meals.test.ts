import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ingredientReady, ingredientText, stepsOf } from '../lib/meals.ts'

test('ingredient text and readiness', () => {
  assert.equal(ingredientText({ qty: '2', unit: 'cup', item: 'flour' }), '2 cups flour')
  assert.equal(ingredientText({ qty: '1', unit: 'tbsp', item: 'soy sauce' }), '1 tbsp soy sauce')
  assert.equal(ingredientText({ qty: '3', unit: 'whole', item: 'eggs' }), '3 eggs')
  assert.equal(ingredientText({ qty: '2', unit: '', item: 'eggs' }), '2 eggs')
  assert.equal(ingredientReady({ qty: '', unit: 'g', item: 'butter' }), false)
  assert.equal(ingredientReady({ qty: '200', unit: '', item: 'butter' }), true)
})

test('steps are tidied from typed lines', () => {
  assert.deepEqual(stepsOf('1. Boil water\n2) Add pasta\n\n- Drain'), [
    'Boil water',
    'Add pasta',
    'Drain',
  ])
  assert.deepEqual(stepsOf(null), [])
})
