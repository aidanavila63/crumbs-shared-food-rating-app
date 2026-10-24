import test from 'node:test'
import assert from 'node:assert/strict'
import { findPhone, findWebsite } from '../lib/fact-parse.ts'

test('phones from photos', () => {
  assert.equal(findPhone('HANA RAMEN\nCall us (416) 555-0199 for pickup'), '+1 416 555 0199')
  assert.equal(findPhone('tel: +1 416.555.0199'), '+1 416 555 0199')
  assert.equal(findPhone('416 555 0199'), '+1 416 555 0199')
  assert.equal(findPhone('Total 23.50\nVisa ****1234'), null)
})

test('websites from photos', () => {
  assert.equal(findWebsite('Order online at hanaramen.ca'), 'https://hanaramen.ca')
  assert.equal(findWebsite('www.HanaRamen.com/menu'), 'https://www.hanaramen.com')
  assert.equal(findWebsite('Follow us instagram.com/hana and ubereats.com'), null)
  assert.equal(findWebsite('hello@hanaramen.com'), null)
})
