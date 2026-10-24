import test from 'node:test'
import assert from 'node:assert/strict'
import { hoursToText, parseHoursText, sameHours } from '../lib/hours-text.ts'
import { openStatus } from '../lib/place-info.ts'

test('OSM opening_hours', () => {
  const h = parseHoursText('Mo-Fr 11:00-22:00; Sa,Su 12:00-23:00; PH off', -240)!
  assert.equal(h.periods.length, 7)
  assert.deepEqual(
    h.periods.find((p) => p.o[0] === 1),
    { o: [1, 11, 0], c: [1, 22, 0] },
  )
  assert.equal(hoursToText(h), 'Mon-Fri 11am-10pm; Sat-Sun 12pm-11pm')
  assert.deepEqual(parseHoursText('24/7', 0)!.periods, [{ o: [0, 0, 0], c: null }])
})

test('human text, closed days, late nights and split shifts', () => {
  const h = parseHoursText('Mon–Thu 11am - 10pm\nFri-Sat 11-1am\nSunday closed', 0)!
  assert.equal(hoursToText(h), 'Mon-Thu 11am-10pm; Fri-Sat 11am-1am; Sun closed')
  assert.deepEqual(h.periods.find((p) => p.o[0] === 5)!.c, [6, 1, 0])
  const split = parseHoursText('Tue to Sun: 11:30-14:30, 17:00-22:00; closed Monday', 0)!
  assert.equal(hoursToText(split), 'Mon closed; Tue-Sun 11:30am-2:30pm, 5pm-10pm')
  assert.equal(hoursToText(parseHoursText('Daily 11-10', 0)), 'Mon-Sun 11am-10pm')
  assert.equal(
    hoursToText(parseHoursText('weekends 5-11pm', 0)),
    'Mon-Fri closed; Sat-Sun 5pm-11pm',
  )
  assert.equal(parseHoursText('call for hours', 0), null)
})

test('works with openStatus and compares', () => {
  const h = parseHoursText('Mo-Su 09:00-17:00', 0)!
  assert.equal(openStatus(h, new Date('2026-10-21T12:00:00Z'))!.open, true)
  assert.equal(openStatus(h, new Date('2026-10-21T20:00:00Z'))!.open, false)
  assert.ok(sameHours(h, parseHoursText('daily 9am-5pm', 300)))
})
