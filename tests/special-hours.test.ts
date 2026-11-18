import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentHours, openStatus, specialHoursNote, type Hours } from '../lib/place-info.ts'
import { hoursToText } from '../lib/hours-text.ts'

const usual: Hours = { utc: 0, periods: [{ o: [1, 9, 0], c: [1, 17, 0] }] }
const closed: Hours = { utc: 0, periods: [], until: '2026-12-26', regular: usual }
const mon = (date: string, h: number) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00Z`)

test('special hours: apply through the last day, then the usual ones come back', () => {
  assert.equal(currentHours(closed, mon('2026-12-26', 23)), closed)
  assert.equal(currentHours(closed, mon('2026-12-27', 0)), usual)
  assert.equal(currentHours(usual), usual)
  assert.equal(currentHours({ ...closed, regular: null }, mon('2027-01-01', 1)), null)
})

test('special hours: closed the whole time says so, and the note shows the date', () => {
  assert.equal(openStatus(closed, mon('2026-12-21', 10))?.text, 'Closed for now')
  assert.equal(hoursToText(closed, mon('2026-12-21', 10)), 'Closed')
  assert.equal(specialHoursNote(closed, mon('2026-12-21', 10)), 'Special hours until Dec 26')
  // 2026-12-28 is a Monday: usual hours again, no note
  assert.equal(openStatus(closed, mon('2026-12-28', 10))?.open, true)
  assert.equal(specialHoursNote(closed, mon('2026-12-28', 10)), null)
})

test('special hours: the restaurant’s own day decides (time zones)', () => {
  const toronto: Hours = { ...closed, utc: -300 }
  // 03:00 UTC on Dec 27 is still Dec 26 in Toronto
  assert.equal(currentHours(toronto, new Date('2026-12-27T03:00:00Z')), toronto)
})

test('Round 94: special hours set ahead — usual hours until then, a notice two weeks before', async () => {
  const { upcomingHoursNote } = await import('../lib/place-info.ts')
  const usual: Hours = { utc: -300, periods: [{ o: [1, 11, 0], c: [1, 22, 0] }] }
  const xmas: Hours = { utc: -300, periods: [], from: '2026-12-25', until: '2026-12-25', regular: usual }
  assert.equal(currentHours(xmas, new Date('2026-12-18T17:00:00Z')), usual)
  assert.equal(currentHours(xmas, new Date('2026-12-25T17:00:00Z')), xmas)
  assert.equal(currentHours(xmas, new Date('2026-12-26T17:00:00Z')), usual)
  assert.equal(specialHoursNote(xmas, new Date('2026-12-18T17:00:00Z')), 'Closed Dec 25')
  assert.equal(specialHoursNote(xmas, new Date('2026-12-25T17:00:00Z')), 'Closed today')
  assert.equal(upcomingHoursNote(xmas, new Date('2026-11-18T17:00:00Z')), null) // more than 2 weeks away
  const stretch: Hours = { ...xmas, periods: [{ o: [4, 11, 0], c: [4, 15, 0] }], from: '2026-12-30', until: '2027-01-02' }
  assert.equal(specialHoursNote(stretch, new Date('2026-12-20T17:00:00Z')), 'Special hours Dec 30–Jan 2')
  assert.equal(openStatus(xmas, new Date('2026-12-25T17:00:00Z'))?.open, false)
})

test('Round 94: holidays two weeks ahead', async () => {
  const { holidaysAhead, holidaysOf, coveredBySpecialHours } = await import('../lib/holidays.ts')
  const names = Object.fromEntries(holidaysOf(2027).map((h) => [h.name, h.date]))
  assert.equal(names['Good Friday'], '2027-03-26')
  assert.equal(names['Victoria Day'], '2027-05-24')
  assert.equal(names['Thanksgiving'], '2027-10-11')
  assert.equal(names['Family Day'], '2027-02-15')
  assert.deepEqual(holidaysAhead('2026-12-20').map((h) => h.name), ['Christmas Eve', 'Christmas Day', 'Boxing Day', 'New Year’s Eve', 'New Year’s Day'])
  assert.equal(coveredBySpecialHours({ from: '2026-12-24', until: '2026-12-26' }, '2026-12-25', '2026-12-20'), true)
  assert.equal(coveredBySpecialHours({ until: '2026-12-26' }, '2026-12-25', '2026-12-20'), true)
  assert.equal(coveredBySpecialHours({ from: '2026-12-26', until: '2026-12-26' }, '2026-12-25', '2026-12-20'), false)
  assert.equal(coveredBySpecialHours(null, '2026-12-25', '2026-12-20'), false)
})
