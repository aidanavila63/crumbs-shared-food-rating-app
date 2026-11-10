import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cityLabel,
  directionsUrl,
  factChips,
  histRows,
  hoursLines,
  isRedirect,
  menuSections,
  metaLine,
  phoneHref,
  profilePath,
  restaurantPath,
  safeUrl,
  scoreLine,
  siteLabel,
  spendLine,
  websiteSources,
} from '../lib/public-page.ts'
import { daysUntilHandleChange, handleShapeProblem, suggestHandle } from '../lib/handles.ts'

test('links and labels', () => {
  assert.equal(restaurantPath('etobicoke', 'lantern-pho'), '/r/etobicoke/lantern-pho')
  assert.equal(profilePath('Maya.Eats'), '/u/maya.eats')
  assert.equal(cityLabel('st-catharines'), 'St Catharines')
  assert.equal(cityLabel(null), '')
  assert.equal(metaLine({ cuisine: 'Vietnamese', price_level: 2, city: 'etobicoke' }), 'Vietnamese · $$ · Etobicoke')
  assert.equal(metaLine({ cuisine: null, price_level: null, city: null }), '')
  assert.ok(isRedirect({ redirect: { city: 'a', slug: 'b' } }))
  assert.ok(!isRedirect(null))
})

test('score, bars and spend', () => {
  assert.equal(scoreLine({ rating: null }), null)
  const rating = { avg: 4.4, groups: 12, ratings: 20, hist: { '5': 10, '4': 5, '3': 3, '2': 1, '1': 1 }, would_return: 90 }
  assert.equal(scoreLine({ rating }), '4.4 from 12 groups')
  assert.equal(scoreLine({ rating: { ...rating, groups: 1 } }), '4.4 from 1 group')
  const rows = histRows(rating.hist)
  assert.equal(rows[0].stars, 5)
  assert.equal(rows[0].pct, 100)
  assert.equal(rows[1].pct, 50)
  assert.equal(spendLine(null), null)
  assert.equal(spendLine({ per_head: 22, lunch: 14, dinner: null }), 'About $22 a head · lunch $14')
})

test('good to know chips put warnings first', () => {
  const chips = factChips({
    cards: { verdict: true, owner: null },
    cash_only: { verdict: true, owner: true },
    patio: { verdict: false, owner: null },
  })
  assert.equal(chips[0].label, 'Cash only')
  assert.ok(chips[0].owner)
  assert.ok(chips.some((c) => c.label === 'Takes cards'))
  assert.ok(!chips.some((c) => c.label === 'Patio')) // a "no" on patio isn't worth a chip
})

test('hours, phone and web links are safe', () => {
  assert.deepEqual(hoursLines(null), [])
  const lines = hoursLines({ utc: 0, periods: [{ o: [1, 11, 0], c: [1, 22, 0] }] })
  assert.ok(lines.length >= 1)
  assert.ok(lines[0].startsWith('Mon'))
  assert.equal(phoneHref('(416) 555-0199'), 'tel:4165550199')
  assert.equal(phoneHref('12'), null)
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('example.com/menu'), 'https://example.com/menu')
  assert.equal(siteLabel('https://www.example.com/x'), 'example.com')
})

test('directions use the name and place id, not Google data', () => {
  const url = directionsUrl({ name: 'Lantern Pho', address: null, google_place_id: 'abc' })
  assert.ok(url.includes('query=Lantern%20Pho'))
  assert.ok(url.includes('query_place_id=abc'))
  assert.ok(!directionsUrl({ name: 'X', address: '1 Main', google_place_id: null }).includes('place_id'))
})

test('menu sections follow the usual order', () => {
  const s = menuSections([
    { name: 'Cake', price: 5, course: 'dessert', dietary: null, description: null, claimed: false },
    { name: 'Soup', price: 6, course: 'starter', dietary: null, description: null, claimed: false },
    { name: 'Odd', price: null, course: null, dietary: null, description: null, claimed: false },
  ])
  assert.deepEqual(s.map((x) => x.course), ['starter', 'dessert', 'other'])
})

test('handle shape rules match the database', () => {
  assert.equal(handleShapeProblem('maya.eats'), null)
  assert.equal(handleShapeProblem('ab'), 'At least 3 characters')
  assert.equal(handleShapeProblem('9lives'), 'Start with a letter')
  assert.equal(handleShapeProblem('a..b'), 'No two dots in a row')
  assert.equal(handleShapeProblem('abc.'), "Can't end with a dot")
  assert.equal(handleShapeProblem('has space'), 'Letters, numbers, _ and single dots only')
  assert.equal(handleShapeProblem('x'.repeat(21)), 'At most 20 characters')
  assert.equal(handleShapeProblem(''), 'Pick a name for your link')
})

test('suggested handles and the 30-day wait', () => {
  assert.equal(suggestHandle('Maya Chen'), 'maya_chen')
  assert.equal(suggestHandle('Zoë'), 'zoe')
  assert.equal(suggestHandle('🍜'), 'foodie')
  assert.equal(suggestHandle('42 Ninja'), 'ninja')
  const now = new Date('2026-11-03T12:00:00Z')
  assert.equal(daysUntilHandleChange(null, now), 0)
  assert.equal(daysUntilHandleChange('2026-10-24T12:00:00Z', now), 20)
  assert.equal(daysUntilHandleChange('2026-09-01T12:00:00Z', now), 0)
})

const siteFields = { phone: '(416) 555-0199', website: 'https://lanternpho.com', address: '1 King St', hours: null, cuisine: null, price_level: null }

test('website sources group facts by page and keep the newest date', () => {
  const out = websiteSources({
    ...siteFields,
    source_urls: { phone: 'https://lanternpho.com/contact', address: 'https://lanternpho.com/contact', website: 'https://lanternpho.com/' },
    source_at: { phone: '2026-11-01T10:00:00Z', address: '2026-11-03T10:00:00Z', website: '2026-10-01T10:00:00Z' },
  })
  assert.equal(out.length, 2)
  assert.deepEqual(out[0].facts, ['Phone', 'Address'])
  assert.equal(out[0].host, 'lanternpho.com')
  assert.equal(out[0].checked, '2026-11-03T10:00:00Z')
  assert.deepEqual(out[1].facts, ['Website'])
})

test('website sources skip facts the page does not show, unsafe links and bad dates', () => {
  // hours has a source but no value on the page; the second link is not a web link
  const out = websiteSources({
    ...siteFields,
    source_urls: { hours: 'https://lanternpho.com/', phone: 'javascript:alert(1)', cuisine: 'https://lanternpho.com/' },
    source_at: { hours: 'not a date' },
  })
  assert.deepEqual(out, [])
  assert.deepEqual(websiteSources({ ...siteFields, source_urls: null, source_at: null }), [])
  const noDate = websiteSources({ ...siteFields, source_urls: { phone: 'https://lanternpho.com/' }, source_at: { phone: 'nope' } })
  assert.equal(noDate[0].checked, null)
})
