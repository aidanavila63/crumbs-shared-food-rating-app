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

import { siteFacts } from '../lib/site-info.ts'

const page = (node: object) =>
  `<script type="application/ld+json">${JSON.stringify(node)}</script>`
const here = { name: 'Bamiyan Kabob', website: 'https://bamiyan.ca', latitude: 43.7, longitude: -79.4, utc: -240 }

test('keeps facts from the restaurant’s own page, including where it is', () => {
  const info = readSiteInfo(
    page({
      '@type': 'Restaurant',
      name: 'Bamiyan Kabob',
      telephone: '416 555 0199',
      address: { streetAddress: '1 King St W', addressLocality: 'Toronto', addressRegion: 'ON', postalCode: 'M5H 1A1' },
      geo: { latitude: '43.7005', longitude: -79.4004 },
      openingHours: 'Mo-Su 11:00-22:00',
    }),
    'https://bamiyan.ca',
  )
  assert.equal(info.address, '1 King St W, Toronto, ON M5H 1A1')
  const facts = siteFacts(info, here)
  assert.deepEqual(facts.location, { lat: 43.7005, lng: -79.4004 })
  assert.equal(facts.website, 'https://bamiyan.ca')
  assert.equal(facts.hours?.periods.length, 7)
  assert.equal(facts.hours?.utc, -240)
})

test('ignores pages about someone else, chains and far-away head offices', () => {
  const other = readSiteInfo(page({ '@type': 'Restaurant', name: 'Pizza Palace', telephone: '416 555 0100' }), 'https://x.ca')
  assert.deepEqual(siteFacts(other, here), {})
  const chain = readSiteInfo(
    page({ '@graph': [
      { '@type': 'Restaurant', name: 'Bamiyan Kabob', address: 'A St, Toronto' },
      { '@type': 'Restaurant', name: 'Bamiyan Kabob', address: 'B St, Ottawa' },
    ] }),
    'https://x.ca',
  )
  assert.deepEqual(siteFacts(chain, here), {})
  const far = readSiteInfo(
    page({ '@type': 'Restaurant', name: 'Bamiyan Kabob', telephone: '416 555 0100', geo: { latitude: 45.4, longitude: -75.7 } }),
    'https://x.ca',
  )
  const facts = siteFacts(far, here)
  assert.equal(facts.phone, '416 555 0100')
  assert.equal(facts.location, undefined)
  assert.equal(facts.website, undefined)
  // A tel: link alone, with no restaurant described, isn't enough.
  assert.deepEqual(siteFacts(readSiteInfo('<a href="tel:4165550100">Call</a>', 'https://x.ca'), here), {})
})

test('remembers the page the facts came from, only when there are facts and it is a web page', () => {
  const info = readSiteInfo(
    page({ '@type': 'Restaurant', name: 'Bamiyan Kabob', telephone: '416 555 0199' }),
    'https://bamiyan.ca',
  )
  assert.equal(siteFacts({ ...info, page_url: 'https://bamiyan.ca/contact' }, here).source_url, 'https://bamiyan.ca/contact')
  // No page address, or not a web link: nothing is recorded.
  assert.equal(siteFacts(info, here).source_url, undefined)
  assert.equal(siteFacts({ ...info, page_url: 'javascript:alert(1)' }, here).source_url, undefined)
  // Someone else's page gives no facts, so no source either.
  const other = readSiteInfo(page({ '@type': 'Restaurant', name: 'Pizza Palace', telephone: '416 555 0100' }), 'https://x.ca')
  assert.deepEqual(siteFacts({ ...other, page_url: 'https://x.ca/' }, here), {})
})
