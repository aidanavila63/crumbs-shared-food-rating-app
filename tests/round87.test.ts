import test from 'node:test'
import assert from 'node:assert/strict'
import { openAtDate, openAtLabel } from '../lib/open-at.ts'
import { placeHere } from '../lib/youre-here.ts'
import { ATTRS, FILTER_ATTRS, SENSITIVE_ATTRS, hasAllFacts } from '../lib/good-to-know.ts'
import { openStatus } from '../lib/place-info.ts'

test('open at: now, for dinner, night out, a picked time', () => {
  const noon = new Date('2026-11-18T12:00:00')
  assert.equal(openAtDate(null), null)
  assert.equal(openAtDate('now', noon), noon)
  assert.equal(openAtDate('dinner', noon)!.getHours(), 17)
  const late = new Date('2026-11-18T21:00:00')
  assert.deepEqual(openAtDate('dinner', late), late)
  assert.equal(openAtDate('2026-11-20T19:30')!.getMinutes(), 30)
  assert.equal(openAtDate('nonsense'), null)
  assert.equal(openAtLabel('now'), 'Open now')
  assert.equal(openAtLabel('dinner'), 'Open for dinner')
  // a place open 11 am–10 pm every day (restaurant on Toronto time) is open at 7 pm, closed at 11 pm
  const hours = {
    utc: -300,
    periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      o: [d, 11, 0] as [number, number, number],
      c: [d, 22, 0] as [number, number, number],
    })),
  }
  assert.equal(openStatus(hours, new Date('2026-11-19T00:00:00Z'))?.open, true) // 7 pm Toronto
  assert.equal(openStatus(hours, new Date('2026-11-19T04:00:00Z'))?.open, false) // 11 pm Toronto
})

test("you're here: the closest saved place within 120 m", () => {
  const places = [
    { id: 'far', latitude: 43.66, longitude: -79.39 },
    { id: 'near', latitude: 43.6501, longitude: -79.3801 },
    { id: 'nopin', latitude: null, longitude: null },
  ]
  assert.equal(placeHere(places, { lat: 43.65, lng: -79.38 })?.id, 'near')
  assert.equal(placeHere(places, { lat: 43.7, lng: -79.5 }), null)
  assert.equal(placeHere(places, null), null)
})

test('Good to know: new questions, filters and the diet warning list', () => {
  for (const key of ['dog_friendly', 'wifi', 'kosher_options', 'takeout', 'big_groups'])
    assert.ok(
      ATTRS.some((a) => a.key === key),
      key,
    )
  assert.ok(FILTER_ATTRS.every((key) => ATTRS.some((a) => a.key === key)))
  assert.ok(
    SENSITIVE_ATTRS.includes('kosher_options') && SENSITIVE_ATTRS.includes('vegetarian_options'),
  )
  const facts = { r1: ['patio', 'wifi'] }
  assert.equal(hasAllFacts('r1', ['patio'], facts), true)
  assert.equal(hasAllFacts('r1', ['patio', 'tvs'], facts), false)
  assert.equal(hasAllFacts(null, ['patio'], facts), false)
  assert.equal(hasAllFacts(null, [], facts), true)
})

test('every Good to know question in the app is one the database accepts, and the other way round', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../supabase/migrations/20261124_round87.sql', import.meta.url), 'utf8')
  const body = sql.slice(sql.indexOf('function public.attr_keys()'), sql.indexOf('$$;', sql.indexOf('function public.attr_keys()')))
  const keys = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(keys, ATTRS.map((a) => a.key).sort())
})

test('for dinner and night out check the whole window', async () => {
  const { openAtTimes, openAtMatches } = await import('../lib/open-at.ts')
  const noon = new Date('2026-11-18T12:00:00')
  const dinner = openAtTimes('dinner', noon)
  assert.equal(dinner.length, 11) // 5:00, 5:30 … 10:00 pm
  assert.equal(dinner[0].getHours(), 17)
  assert.equal(dinner.at(-1)!.getHours(), 22)
  // after 10 pm it means tomorrow's dinner
  assert.equal(openAtTimes('dinner', new Date('2026-11-18T22:30:00'))[0].getDate(), 19)
  const night = openAtTimes('late', noon)
  assert.equal(night[0].getHours(), 23)
  assert.equal(night.at(-1)!.getHours(), 2)
  // at 1 am, night out is the rest of tonight
  assert.equal(openAtTimes('late', new Date('2026-11-19T01:00:00'))[0].getHours(), 1)
  // checked in this computer's own time zone: a place open 6–9 pm local fits dinner, not night out
  const local = -new Date('2026-11-18T12:00:00').getTimezoneOffset()
  const hours = {
    utc: local,
    periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      o: [d, 18, 0] as [number, number, number],
      c: [d, 21, 0] as [number, number, number],
    })),
  }
  assert.equal(openAtMatches(hours, 'dinner', noon), true)
  assert.equal(openAtMatches(hours, 'late', noon), false)
  assert.equal(openAtMatches(null, 'dinner', noon), false)
  assert.equal(openAtMatches(null, null, noon), true)
})
