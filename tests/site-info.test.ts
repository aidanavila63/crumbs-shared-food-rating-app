import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodsFromSpec, periodsFromText, readSiteInfo } from '../lib/site-info.ts'

test('reads a restaurant from JSON-LD @graph', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@graph': [
      { '@type': 'WebSite', name: 'x' },
      {
        '@type': ['Restaurant'],
        telephone: '+1 416-555-0199',
        servesCuisine: ['Afghan', 'Halal'],
        priceRange: '$$',
        hasMenu: '/menu',
        openingHoursSpecification: [
          { dayOfWeek: ['Monday', 'Tuesday'], opens: '11:00', closes: '22:00' },
          { dayOfWeek: 'https://schema.org/Saturday', opens: '17:00', closes: '02:00' },
        ],
      },
    ],
  })}</script></head></html>`
  const info = readSiteInfo(html, 'https://naan.example/')
  assert.equal(info.phone, '+1 416-555-0199')
  assert.equal(info.cuisine, 'Afghan, Halal')
  assert.equal(info.price_level, 2)
  assert.equal(info.menu_url, 'https://naan.example/menu')
  assert.deepEqual(info.periods, [
    { o: [1, 11, 0], c: [1, 22, 0] },
    { o: [2, 11, 0], c: [2, 22, 0] },
    { o: [6, 17, 0], c: [0, 2, 0] },
  ])
})

test('openingHours text and tel: fallback', () => {
  assert.deepEqual(periodsFromText('Fr-Su 10-23'), [
    { o: [5, 10, 0], c: [5, 23, 0] },
    { o: [6, 10, 0], c: [6, 23, 0] },
    { o: [0, 10, 0], c: [0, 23, 0] },
  ])
  const info = readSiteInfo('<a href="tel:4165550100">Call</a>', 'https://a.example')
  assert.equal(info.phone, '4165550100')
  assert.equal(info.periods, null)
})

test('closed days (00:00-00:00) are skipped', () => {
  assert.deepEqual(periodsFromSpec({ dayOfWeek: 'Sunday', opens: '00:00', closes: '00:00' }), [])
})
