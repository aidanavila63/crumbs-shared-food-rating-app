import test from 'node:test'
import assert from 'node:assert/strict'
import { menuDishes, receiptTip, receiptTotal } from '../lib/ocr-parse.ts'

test('receipt total prefers the Total line over subtotal', () => {
  const text = `HANA RAMEN\nTonkotsu 16.50\nGyoza 8.00\nSubtotal 24.50\nHST 3.19\nTip 4.00\nTOTAL $31.69\nVisa ****1234`
  assert.equal(receiptTotal(text), 31.69)
  assert.equal(receiptTip(text), 4)
  assert.equal(receiptTotal('Coffee 4.50\nCake 6.25'), 6.25)
  assert.equal(receiptTotal('no numbers here'), null)
})

test('menu lines become dishes with prices and descriptions', () => {
  const text = `STARTERS\nEDAMAME ........ 6\nPork Gyoza - $9.50\nPan fried, six pieces with chili oil\nMains\nTonkotsu Ramen 16.5\nTonkotsu Ramen 16.5\nTax 13\nServes 2 people 40`
  const dishes = menuDishes(text)
  assert.deepEqual(
    dishes.map((d) => [d.name, d.price]),
    [
      ['Edamame', 6],
      ['Pork Gyoza', 9.5],
      ['Tonkotsu Ramen', 16.5],
    ],
  )
  assert.equal(dishes[1].description, 'Pan fried, six pieces with chili oil')
})
