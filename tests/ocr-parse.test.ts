import test from 'node:test'
import assert from 'node:assert/strict'
import { menuDishes, receiptItems, receiptTip, receiptTotal } from '../lib/ocr-parse.ts'

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

test('receipt items skip totals, taxes and payments; split quantities', () => {
  const text = `HANA RAMEN\nTable 4 Server Amy\n1 Tonkotsu Ramen 16.50\n2 Pork Gyoza 19.00\nGreen Tea 3.25\nSubtotal 38.75\nHST 13% 5.04\nTip 6.00\nDelivery fee 2.99\nTotal 52.78\nVISA 52.78`
  const items = receiptItems(text)
  assert.deepEqual(
    items.map((i) => [i.name, i.price]),
    [
      ['Tonkotsu Ramen', 16.5],
      ['Pork Gyoza', 9.5],
      ['Green Tea', 3.25],
    ],
  )
})
