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
