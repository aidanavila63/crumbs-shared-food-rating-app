import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openStatus, type Hours } from '../lib/place-info.ts'
import { factFreshness, type Restaurant } from '../lib/restaurants.ts'
import { siteFacts, type SiteInfo } from '../lib/site-info.ts'

// Mondays 11am–10pm, UTC.
const mon: Hours = { utc: 0, periods: [{ o: [1, 11, 0], c: [1, 22, 0] }] }
const at = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00Z`) // a Monday

test('open, closing soon, closed', () => {
  assert.deepEqual(
    [openStatus(mon, at('15:00'))?.open, openStatus(mon, at('15:00'))?.soon],
    [true, false],
  )
  assert.equal(openStatus(mon, at('15:00'))?.text, 'Open · closes 10 PM')
  const soon = openStatus(mon, at('21:10'))
  assert.equal(soon?.open, true)
  assert.equal(soon?.soon, true)
  assert.equal(soon?.text, 'Closing soon · 10 PM')
  // Exactly an hour left still counts; an hour and a minute doesn't.
  assert.equal(openStatus(mon, at('21:00'))?.soon, true)
  assert.equal(openStatus(mon, at('20:59'))?.soon, false)
  const shut = openStatus(mon, at('23:00'))
  assert.equal(shut?.open, false)
  assert.equal(shut?.soon, false)
})

test('past midnight closing and 24 hours', () => {
  const late: Hours = { utc: 0, periods: [{ o: [5, 18, 0], c: [6, 2, 0] }] } // Fri 6pm → Sat 2am
  assert.equal(openStatus(late, new Date('2026-10-24T01:30:00Z'))?.soon, true) // Sat 1:30am
  assert.equal(openStatus(late, new Date('2026-10-23T22:00:00Z'))?.soon, false) // Fri 10pm
  const all: Hours = { utc: 0, periods: [{ o: [0, 0, 0], c: null }] }
  assert.equal(openStatus(all, at('12:00'))?.soon, false)
})

const base = { id: 'r', source_key: 'k', name: 'N' } as Restaurant
test('fact freshness dots', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  const r = (iso: string | null) =>
    ({ ...base, sources: { phone: 'site' }, source_at: iso ? { phone: iso } : {} }) as Restaurant
  assert.equal(factFreshness(r('2026-11-03T12:00:00Z'), 'phone', now)?.level, 'fresh')
  assert.equal(factFreshness(r('2026-11-03T12:00:00Z'), 'phone', now)?.label, 'checked today')
  assert.equal(factFreshness(r('2026-10-14T12:00:00Z'), 'phone', now)?.label, 'checked 3 weeks ago')
  assert.equal(factFreshness(r('2026-07-01T12:00:00Z'), 'phone', now)?.level, 'aging')
  assert.equal(factFreshness(r('2026-01-01T12:00:00Z'), 'phone', now)?.level, 'old')
  assert.equal(factFreshness(r(null), 'phone', now)?.level, 'old')
  assert.equal(factFreshness(r('2026-11-01T00:00:00Z'), 'website', now), null) // no source for it
  // A member's recent check beats an old reading.
  const checked = { ...r('2026-01-01T12:00:00Z'), verified: { phone: { n: 2, at: '2026-11-01T00:00:00Z' } } } as Restaurant
  assert.equal(factFreshness(checked, 'phone', now)?.level, 'fresh')
})

const info = (extra: Partial<SiteInfo>): SiteInfo =>
  ({ found: true, locations: 1, name: 'Table Nine', address: null, location: null, phone: '416 555 0100', cuisine: null,
    price_level: null, periods: null, menu_url: null, reservations: null, image: null, description: null,
    page_url: 'https://tablenine.example/', ...extra }) as SiteInfo
const rest = { name: 'Table Nine', website: 'https://tablenine.example', latitude: null, longitude: null, utc: 0 }

test('a booking link is held only for the right restaurant and only if it is a web link', () => {
  assert.equal(siteFacts(info({ reservations: 'https://book.example/t9' }), rest).reservations, 'https://book.example/t9')
  assert.equal(siteFacts(info({ reservations: 'javascript:alert(1)' }), rest).reservations, undefined)
  assert.equal(siteFacts(info({ reservations: 'https://x.example/a b' }), rest).reservations, undefined)
  assert.equal(siteFacts(info({ reservations: 'https://book.example/t9', name: 'Other Place' }), rest).reservations, undefined)
  assert.equal(siteFacts(info({ reservations: 'https://book.example/t9', locations: 3 }), rest).reservations, undefined)
})

test('why am I seeing this: source, freshness, confirmations, page', async () => {
  const { factWhy } = await import('../lib/restaurants.ts')
  const now = new Date('2026-11-04T12:00:00Z')
  const r = {
    sources: { hours: 'site', phone: 'google', cuisine: 'crumbs' },
    source_at: { hours: '2026-10-20T00:00:00Z' },
    source_urls: { hours: 'https://www.tablenine.example/contact' },
    verified: { cuisine: { n: 3, at: '2026-11-01T00:00:00Z' } },
  } as unknown as Restaurant
  const hours = factWhy(r, 'hours', now)
  assert.match(hours[0], /own website/)
  assert.match(hours[1], /^Fresh: checked 2 weeks ago/)
  assert.equal(hours.at(-1), 'Page: tablenine.example/contact')
  assert.ok(factWhy(r, 'cuisine', now).includes('3 members have confirmed it.'))
  assert.match(factWhy(r, 'phone', now)[0], /can’t keep it/)
  assert.deepEqual(factWhy(r, 'address', now), [])
})

test('usual spend: middle amount, scaled to the party size', async () => {
  const { usualSpend } = await import('../lib/visit-rating.ts')
  assert.equal(usualSpend([{ spend: 40 }], null), null)
  assert.equal(usualSpend(undefined, null), null)
  assert.equal(usualSpend([{ spend: 40 }, { spend: 60 }, { spend: 200 }], null), 60)
  const visits = [
    { spend: 40, people: 2 },
    { spend: 60, people: 3 },
    { spend: 80, people: 4 },
  ] // $20 each every time
  assert.equal(usualSpend(visits, 5), 100)
  assert.equal(usualSpend(visits, null), 60)
})
