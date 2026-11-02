import test from 'node:test'
import assert from 'node:assert/strict'
import { bestMatch, matchQuery, nameMatch } from '../lib/osm-match.ts'
import { hoursToText } from '../lib/hours-text.ts'

test('name matching', () => {
  assert.equal(nameMatch('Hana Ramen', 'HANA RAMEN'), 1)
  assert.ok(nameMatch('The Burger Joint', 'Burger Joint Restaurant') >= 0.85)
  assert.ok(nameMatch('Café Luna', 'Cafe Luna') >= 0.85)
  assert.ok(nameMatch('Hana Ramen', 'Sushi Bar') < 0.6)
  assert.match(matchQuery(43.65, -79.38), /around:80,43.650000,-79.380000/)
})

test('best match turns tags into facts', () => {
  const json = {
    elements: [
      { type: 'node', id: 1, tags: { name: 'Pizza Place' } },
      {
        type: 'way',
        id: 22,
        tags: {
          name: 'Hana Ramen',
          'addr:housenumber': '10',
          'addr:street': 'Valencia Street',
          'addr:city': 'San Francisco',
          phone: '+1 415 555 0100;+1 415 555 0101',
          website: 'https://hana.example',
          cuisine: 'ramen;japanese',
          opening_hours: 'Mo-Sa 11:30-22:00; Su off',
        },
      },
    ],
  }
  const m = bestMatch(json, 'Hana Ramen', -420)!
  assert.equal(m.osm, 'W22')
  assert.equal(m.data.address, '10 Valencia Street, San Francisco')
  assert.equal(m.data.phone, '+1 415 555 0100')
  assert.equal(m.data.cuisine, 'Ramen')
  assert.equal(hoursToText(m.data.hours), 'Mon-Sat 11:30am-10pm; Sun closed')
  assert.equal(m.data.hours!.utc, -420)
  assert.equal(bestMatch(json, 'Totally Different', 0), null)
})
