import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAmount,
  isoMinutes,
  parseAmount,
  parseIngredientLine,
  readRecipe,
  scaleQty,
} from '../lib/recipe-tools.ts'

test('amounts: read, scale and write back nicely', () => {
  assert.equal(parseAmount('1 1/2'), 1.5)
  assert.equal(parseAmount('½'), 0.5)
  assert.equal(parseAmount('1½'), 1.5)
  assert.equal(parseAmount('a few'), null)
  assert.equal(formatAmount(1.5), '1½')
  assert.equal(formatAmount(1 / 3), '⅓')
  assert.equal(formatAmount(2.4), '2.4')
  assert.equal(scaleQty('1 1/2', 2), '3')
  assert.equal(scaleQty('1/2', 3), '1½')
  assert.equal(scaleQty('2-3', 2), '4–6')
  assert.equal(scaleQty('to taste', 2), 'to taste')
  assert.equal(scaleQty('200', 0.5), '100')
})

test('ingredient lines: amount, known measure, the rest', () => {
  assert.deepEqual(parseIngredientLine('2 cups flour'), { qty: '2', unit: 'cup', item: 'flour' })
  assert.deepEqual(parseIngredientLine('1 1/2 tbsp. soy sauce'), {
    qty: '1 1/2',
    unit: 'tbsp',
    item: 'soy sauce',
  })
  assert.deepEqual(parseIngredientLine('3 eggs'), { qty: '3', unit: '', item: 'eggs' })
  assert.deepEqual(parseIngredientLine('Salt to taste'), {
    qty: '',
    unit: '',
    item: 'Salt to taste',
  })
  assert.deepEqual(parseIngredientLine('½ cup milk'), { qty: '½', unit: 'cup', item: 'milk' })
})

test("a page's recipe data: name, ingredients, steps, servings and times", () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'x' },
      {
        '@type': ['Recipe'],
        name: 'Weeknight Pad Thai &amp; more',
        recipeYield: ['4 servings'],
        prepTime: 'PT15M',
        cookTime: 'PT1H5M',
        recipeIngredient: ['200 g rice noodles', '2 tbsp fish sauce', '1 lime'],
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            itemListElement: [{ '@type': 'HowToStep', text: 'Soak the noodles.' }],
          },
          { '@type': 'HowToStep', text: '<p>Fry everything.</p>' },
        ],
      },
    ],
  })}</script></head></html>`
  const r = readRecipe(html)!
  assert.equal(r.name, 'Weeknight Pad Thai & more')
  assert.equal(r.servings, 4)
  assert.equal(r.prep_minutes, 15)
  assert.equal(r.cook_minutes, 65)
  assert.deepEqual(r.ingredients[0], { qty: '200', unit: 'g', item: 'rice noodles' })
  assert.equal(r.steps, 'Soak the noodles.\nFry everything.')
  assert.equal(readRecipe('<html>no recipe here</html>'), null)
  assert.equal(isoMinutes('PT45M'), 45)
})
