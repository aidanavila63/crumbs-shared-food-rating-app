import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fitsMe,
  knownFor,
  orderForTable,
  safeDishes,
  tableText,
  tooHotFor,
} from '../lib/dish-helpers.ts'

const dish = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, price: null, tags: [], dietary: [], dish_ratings: [], ...extra }) as any
const rated = (points: number) => [{ user_id: 'u', score: 5, points }]

test('known for: reasons picked twice or more, top 3', () => {
  const place = {
    place_ratings: [
      { reasons: ['Great service', 'Cozy'] },
      { reasons: ['Great service', 'Cozy', 'Pricey'] },
      { reasons: ['Bland'] },
    ],
  } as any
  assert.deepEqual(knownFor(place), ['Cozy', 'Great service'])
})

test('too hot for: only people with a limit below the dish', () => {
  const people = [
    { display_name: 'Maya Lee', spice_max: 1 },
    { display_name: 'Jordan', spice_max: null },
    { display_name: 'Sam', spice_max: 3 },
  ] as any
  assert.deepEqual(tooHotFor({ spice: 2 }, people), ['Maya'])
  assert.deepEqual(tooHotFor({ spice: null }, people), [])
})

test('fits me: allergens rule out, diet must match, otherwise unknown', () => {
  const me = { avoid: ['a:nuts', 'loud'], diet: ['Vegetarian'] }
  assert.equal(fitsMe(dish('a', { tags: ['nuts'], dietary: ['Vegetarian'] }), me), 'avoid')
  assert.equal(fitsMe(dish('b', { dietary: ['Vegetarian', 'Vegan'] }), me), 'fits')
  assert.equal(fitsMe(dish('c'), me), 'unknown')
  assert.equal(fitsMe(dish('d'), { avoid: [], diet: [] }), 'unknown')
  assert.equal(fitsMe(dish('e'), { avoid: ['a:nuts'], diet: [] }), 'fits')
  const places = [
    {
      name: 'P',
      dishes: [dish('b', { dietary: ['Vegetarian'], dish_ratings: rated(80) }), dish('c')],
    },
  ] as any
  assert.deepEqual(
    safeDishes(places, me).map((x) => x.dish.id),
    ['b'],
  )
})

test('order for the table: sized by people, skips never-again and avoided dishes', () => {
  const dishes = [
    dish('Gyoza', { course: 'starter', price: 8, dish_ratings: rated(85) }),
    dish('Edamame', { course: 'starter', price: 5, dish_ratings: rated(60) }),
    dish('Tonkotsu', { course: 'main', price: 18, verdict: 'again', dish_ratings: rated(92) }),
    dish('Shoyu', { course: 'main', price: 16, dish_ratings: rated(75) }),
    dish('Curry', { course: 'main', price: 15, verdict: 'never' }),
    dish('Peanut noodles', { course: 'main', price: 15, dish_ratings: rated(99) }),
    dish('Mochi', { course: 'dessert', price: 6, dish_ratings: rated(70) }),
  ]
  const order = orderForTable(dishes, 3, (d) => d.name === 'Peanut noodles')
  assert.deepEqual(
    order.picks.map((p) => p.dish.name),
    ['Gyoza', 'Edamame', 'Tonkotsu', 'Shoyu', 'Mochi'],
  )
  assert.equal(order.total, 53)
  assert.equal(order.perHead, 18)
  assert.match(tableText('Hana Ramen', 3, order), /Order for the table at Hana Ramen \(3 people\)/)
})

test('order for the table without courses: best dishes, about 1.5 a person', () => {
  const dishes = ['a', 'b', 'c', 'd', 'e'].map((n, i) => dish(n, { dish_ratings: rated(90 - i) }))
  assert.deepEqual(
    orderForTable(dishes, 2).picks.map((p) => p.dish.id),
    ['a', 'b', 'c'],
  )
})

test('saved table order: totals before tip, split per person, how many it feeds', async () => {
  const { orderTotals, orderText } = await import('../lib/dish-helpers.ts')
  const dishes = [
    dish('Nachos', { price: 18, shares: 4 }),
    dish('Wings', { price: 14, shares: 2 }),
    dish('Soup'),
  ]
  const items = [
    { dish_id: 'Nachos', qty: 1 },
    { dish_id: 'Wings', qty: 2 },
    { dish_id: 'Soup', qty: 1 },
  ]
  assert.deepEqual(orderTotals(items, dishes, 4), { total: 46, each: 11.5, unpriced: 1, feeds: 9 })
  const text = orderText('Pub', 4, items, dishes)
  assert.match(text, /2× Wings \(\$28\)/)
  assert.match(text, /Nachos \(\$18\) — shares 4/)
  assert.match(text, /About \$46 before tax and tip · ~\$12 each/)
})
