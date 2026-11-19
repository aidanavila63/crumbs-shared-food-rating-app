import test from 'node:test'
import assert from 'node:assert/strict'
import { money } from '../lib/currency.ts'
import { duplicateCandidates, nameKey } from '../lib/merge.ts'

// Round 95's table-menu themes became Round 99's designs: their readability and old ids are checked in round99.test.ts.

test('trip money in its own currency', () => {
  assert.match(money(1234.5, 'EUR'), /1,?234[.,]50/)
  assert.match(money(1234.5, 'EUR'), /€/)
  assert.match(money(30, null), /\$30/)
  assert.match(money(3000, 'JPY'), /3,?000/)
  assert.match(money(12, 'bad'), /\$12/)
})

test('merge: likely copies first', () => {
  assert.equal(nameKey('The Hana Ramen!'), 'hanaramen')
  assert.equal(nameKey('Café Crème'), 'creme')
  const p = (id: string, name: string, lat: number | null = null, restaurant_id: string | null = null) =>
    ({ id, group_id: 'g', name, latitude: lat, longitude: lat === null ? null : -79.4, restaurant_id, formatted_address: null, status: 'Been' }) as any
  const here = p('a', 'Hana Ramen', 43.65)
  const list = duplicateCandidates(here, [here, p('b', 'Zed Bar'), p('c', 'hana ramen (queen st)'), p('d', 'Other', 43.6501), p('e', 'Apple')])
  assert.deepEqual(list.map((x) => [x.place.id, x.likely]), [['c', true], ['d', true], ['e', false], ['b', false]])
  assert.deepEqual(duplicateCandidates(here, [here, p('b', 'Zed Bar')], 'zed').map((x) => x.place.id), ['b'])
})
