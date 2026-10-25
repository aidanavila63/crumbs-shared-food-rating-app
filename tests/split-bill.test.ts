import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billText, splitBill } from '../lib/split-bill.ts'

test('split: own items, shared items, tax and tip in proportion', () => {
  const r = splitBill(
    [
      { name: 'Ramen', price: 18, who: ['a'] },
      { name: 'Curry', price: 12, who: ['b'] },
      { name: 'Gyoza', price: 10, who: ['a', 'b'] },
      { name: 'Beer', price: 7, qty: 2, who: [] }, // nobody ticked → everyone
    ],
    ['a', 'b'],
    { taxPct: 13, tipPct: 18 },
  )
  assert.equal(r.subtotal, 54)
  assert.equal(r.tax, 7.02)
  assert.equal(r.tip, 9.72)
  assert.deepEqual(
    r.shares.map((s) => s.food),
    [30, 24],
  )
  assert.equal(r.shares.reduce((s, x) => s + x.owes, 0).toFixed(2), r.total.toFixed(2))
  assert.deepEqual(
    r.shares.map((s) => s.owes),
    [39.3, 31.44],
  )
  const text = billText('Hana', r, (id) => (id === 'a' ? 'Maya' : 'Jordan'), 'a')
  assert.match(text, /Maya: \$39\.30/)
  assert.match(text, /Maya paid/)
})

test('split: no items gives zero', () => {
  const r = splitBill([], ['a', 'b'], { tipAmount: 10 })
  assert.equal(r.total, 10)
  assert.deepEqual(
    r.shares.map((s) => s.owes),
    [5, 5],
  )
})
