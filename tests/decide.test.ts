import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OCCASIONS,
  crawlDirectionsUrl,
  crawlRoute,
  nextToVote,
  occasionsFor,
  planIcs,
  sessionResults,
  tidyRoute,
} from '../lib/decide.ts'

const place = (id: string, extra: any = {}): any => ({
  id,
  name: id,
  formatted_address: `${id} St`,
  latitude: null,
  longitude: null,
  price_level: null,
  status: 'Been',
  tags: [],
  place_ratings: [],
  ...extra,
})

test('occasions match tags, price and status', () => {
  const date = OCCASIONS.find((o) => o.id === 'date')!
  assert.ok(date.test(place('a', { tags: ['Date night'] })))
  assert.ok(date.test(place('b', { price_level: 3 })))
  assert.ok(!date.test(place('c', { price_level: 1 })))
  const extra = occasionsFor(['Patio', 'Quick'])
  assert.equal(extra.length, OCCASIONS.length + 1)
  assert.ok(extra.at(-1)!.test(place('d', { tags: ['patio'] })))
})

test('session results find matches and progress', () => {
  const session: any = { id: 's', place_ids: ['a', 'b', 'c'] }
  const votes = [
    { session_id: 's', place_id: 'a', user_id: 'me', yes: true },
    { session_id: 's', place_id: 'a', user_id: 'you', yes: true },
    { session_id: 's', place_id: 'b', user_id: 'me', yes: true },
    { session_id: 's', place_id: 'b', user_id: 'you', yes: false },
    { session_id: 'other', place_id: 'c', user_id: 'me', yes: true },
  ]
  const r = sessionResults(session, votes, ['me', 'you'])
  assert.deepEqual(
    r.matches.map((m) => m.placeId),
    ['a'],
  )
  assert.equal(r.progress.me, 2)
  assert.equal(r.everyoneDone, false)
  assert.equal(r.ranked[0].placeId, 'a')
  assert.deepEqual(nextToVote(session, votes, 'me'), ['c'])
})

test('calendar file has the event and escapes text', () => {
  const ics = planIcs(
    {
      id: 'p1',
      title: 'Dinner, finally',
      starts_at: '2026-11-01T23:30:00Z',
      note: 'Bring cash; patio',
    },
    place('Hana', { formatted_address: '1 Main St, Toronto' }),
    new Date('2026-10-24T00:00:00Z'),
  )!
  assert.match(ics, /DTSTART:20261101T233000Z/)
  assert.match(ics, /DTEND:20261102T013000Z/)
  assert.match(ics, /SUMMARY:Dinner\\, finally · Hana/)
  assert.match(ics, /LOCATION:1 Main St\\, Toronto/)
  assert.ok(ics.includes('DESCRIPTION:Bring cash\\; patio'))
  assert.equal(planIcs({ id: 'x', title: 't', starts_at: null, note: null }), null)
})

test('crawl route distances, directions link and tidy order', () => {
  const a = place('a', { latitude: 43.65, longitude: -79.38 })
  const b = place('b', { latitude: 43.66, longitude: -79.38 })
  const c = place('c', { latitude: 43.651, longitude: -79.38 })
  const r = crawlRoute([a, b, c])
  assert.equal(r.legs.length, 2)
  assert.ok(r.km > 2 && r.km < 3)
  assert.equal(r.missing, 0)
  assert.equal(crawlRoute([a, place('x')]).missing, 1)
  const url = crawlDirectionsUrl([a, b, c])!
  assert.match(url, /travelmode=walking/)
  assert.match(url, /waypoints=43.66%2C-79.38/)
  assert.equal(crawlDirectionsUrl([a]), null)
  assert.deepEqual(
    tidyRoute([a, b, c]).map((p) => p.id),
    ['a', 'c', 'b'],
  )
})

test('booking text and "did you go?" (#141, #198)', async () => {
  const { bookingText, didYouGo, planIcs } = await import('../lib/decide.ts')
  assert.equal(
    bookingText({ booked_under: 'Maya', booking_ref: '#A1B2', party: 4 }),
    'Booked under Maya · #A1B2 · table for 4',
  )
  assert.equal(bookingText({ booked_under: null, booking_ref: null, party: null }), null)
  const now = new Date('2026-10-25T20:00:00Z')
  const plan = (id: string, at: string, extra: Record<string, unknown> = {}) =>
    ({ id, place_id: 'p', starts_at: at, outcome: null, ...extra }) as any
  assert.deepEqual(
    didYouGo(
      [
        plan('yesterday', '2026-10-24T19:00:00Z'),
        plan('tonight', '2026-10-25T19:00:00Z'),
        plan('old', '2026-10-10T19:00:00Z'),
        plan('answered', '2026-10-23T19:00:00Z', { outcome: 'went' }),
        plan('noplace', '2026-10-23T19:00:00Z', { place_id: null }),
      ],
      now,
    ).map((p) => p.id),
    ['yesterday'],
  )
  const ics = planIcs(
    {
      id: 'x',
      title: 'Dinner',
      starts_at: '2026-10-30T23:00:00Z',
      note: 'Bring cash',
      booked_under: 'Maya',
      booking_ref: null,
      party: 2,
    },
    null,
  )!
  assert.match(ics, /DESCRIPTION:Booked under Maya · table for 2\\nBring cash/)
})
