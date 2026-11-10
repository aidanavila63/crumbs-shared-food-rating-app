// Opening hours written by people (or OpenStreetMap's opening_hours tag) ⇄ Crumbs' Hours shape.
// Lets Crumbs own its hours data: typed in, read off a photo of the door sign, or from open data.
import { currentHours, type Hours } from './place-info.ts'

const DAY_WORDS: [RegExp, number][] = [
  [/^(su|sun|sunday|sundays)$/, 0],
  [/^(mo|mon|monday|mondays)$/, 1],
  [/^(tu|tue|tues|tuesday|tuesdays)$/, 2],
  [/^(we|wed|weds|wednesday|wednesdays)$/, 3],
  [/^(th|thu|thur|thurs|thursday|thursdays)$/, 4],
  [/^(fr|fri|friday|fridays)$/, 5],
  [/^(sa|sat|saturday|saturdays)$/, 6],
]
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayOf(word: string): number | null {
  const w = word.toLowerCase().replace(/\./g, '')
  for (const [re, d] of DAY_WORDS) if (re.test(w)) return d
  return null
}

/** "Mo-Fr", "Mon, Wed", "Sat & Sun", "daily" → day numbers (0 = Sunday). */
function parseDays(text: string): number[] | null {
  const t = text.trim().toLowerCase()
  if (!t || /^(daily|every ?day|all week|7 days( a week)?|mo-su|mon-sun)$/.test(t))
    return [0, 1, 2, 3, 4, 5, 6]
  if (/^(weekdays)$/.test(t)) return [1, 2, 3, 4, 5]
  if (/^(weekends?)$/.test(t)) return [0, 6]
  const days = new Set<number>()
  for (const part of t.split(/\s*(?:,|&|\band\b)\s*/)) {
    if (!part) continue
    const range = part.split(/\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b)\s*/)
    if (range.length === 2) {
      const a = dayOf(range[0])
      const b = dayOf(range[1])
      if (a === null || b === null) return null
      for (let d = a; ; d = (d + 1) % 7) {
        days.add(d)
        if (d === b) break
      }
    } else {
      const d = dayOf(part)
      if (d === null) return null
      days.add(d)
    }
  }
  return days.size ? [...days].sort() : null
}

/** "11", "11:30", "11am", "10:30 pm", "noon", "midnight" → [hour, minute, explicitPm?] */
function parseTime(text: string): [number, number, 'am' | 'pm' | null] | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  if (t === 'noon') return [12, 0, 'pm']
  if (t === 'midnight') return [0, 0, 'am']
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?(a|am|p|pm)?$/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const mer = m[3] ? (m[3].startsWith('p') ? 'pm' : 'am') : null
  if (h > 24 || min > 59) return null
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  return [h === 24 ? 0 : h, min, mer]
}

/** "11-22", "11am - 10pm", "11-10" (→ 11 AM to 10 PM) */
function parseRange(text: string): { o: [number, number]; c: [number, number] } | null {
  const parts = text.split(/\s*(?:-|–|—|\bto\b)\s*/)
  if (parts.length !== 2) return null
  const a = parseTime(parts[0])
  const b = parseTime(parts[1])
  if (!a || !b) return null
  let [oh] = a
  const [, om] = a
  let [ch] = b
  const [, cm] = b
  // "11-10" with no am/pm: closing earlier than opening means the evening.
  if (!b[2] && ch < 12 && ch * 60 + cm <= oh * 60 + om && ch !== 0) ch += 12
  // "5-11pm": opening without am/pm before a pm close that's earlier in the day → pm too.
  if (!a[2] && b[2] === 'pm' && oh < 12 && oh + 12 < ch) oh += 12
  return { o: [oh, om], c: [ch, cm] }
}

/**
 * Parses lines like "Mon–Fri 11am–10pm; Sat-Sun 12-11pm; closed Tuesday" or OSM's
 * "Mo-Fr 11:00-22:00; Sa,Su 12:00-23:00". `utc` = the restaurant's offset in minutes.
 * Returns null if nothing usable was found.
 */
export function parseHoursText(text: string, utc: number): Hours | null {
  const clean = text
    .replace(/\b(PH|SH)\b[^;\n]*/g, '') // public/school holiday rules: ignored
    .replace(/[–—]/g, '-')
    .trim()
  if (!clean) return null
  if (/^(24\/7|open 24 hours|24 hours)$/i.test(clean))
    return { utc, periods: [{ o: [0, 0, 0], c: null }] }
  const perDay = new Map<number, { o: [number, number]; c: [number, number] }[] | 'closed'>()
  const segments = clean.split(/\s*(?:;|\n|\|)\s*/).filter(Boolean)
  for (const seg of segments) {
    // Split "<days> <times>" — times may be several: "11:00-14:00,17:00-22:00"
    const m = /^(.*?)\s*((?:\d|noon|midnight|closed|off).*)$/i.exec(seg)
    if (!m) continue
    let daysText = m[1].replace(/:$/, '').trim()
    let timesText = m[2].trim()
    // "closed Tuesday" / "Tuesday closed"
    if (/^(closed|off)\b/i.test(timesText) && !daysText) {
      daysText = timesText.replace(/^(closed|off)\s*/i, '')
      timesText = 'closed'
    }
    const days = parseDays(daysText)
    if (!days) continue
    if (/^(closed|off)$/i.test(timesText)) {
      days.forEach((d) => perDay.set(d, 'closed'))
      continue
    }
    const ranges = timesText
      .split(/\s*(?:,|&|\band\b)\s*/)
      .map(parseRange)
      .filter((r): r is NonNullable<typeof r> => !!r)
    if (!ranges.length) continue
    days.forEach((d) => perDay.set(d, ranges))
  }
  const periods: Hours['periods'] = []
  for (const [day, ranges] of [...perDay.entries()].sort((a, b) => a[0] - b[0])) {
    if (ranges === 'closed') continue
    for (const r of ranges) {
      const crosses = r.c[0] * 60 + r.c[1] <= r.o[0] * 60 + r.o[1]
      periods.push({ o: [day, r.o[0], r.o[1]], c: [crosses ? (day + 1) % 7 : day, r.c[0], r.c[1]] })
    }
  }
  return periods.length ? { utc, periods } : null
}

const fmt = (h: number, m: number) =>
  `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`

/** Hours → "Mon-Fri 11am-10pm; Sat-Sun 12pm-11pm; Tue closed" (also the edit box's starting text). */
export function hoursToText(given: Hours | null | undefined, now = new Date()): string {
  const hours = currentHours(given, now)
  if (!hours?.periods?.length) return hours?.until ? 'Closed' : ''
  if (hours.periods.length === 1 && !hours.periods[0].c) return '24/7'
  const byDay = new Map<number, string>()
  for (const p of hours.periods) {
    if (!p.c) continue
    const range = `${fmt(p.o[1], p.o[2])}-${fmt(p.c[1], p.c[2])}`
    byDay.set(p.o[0], byDay.has(p.o[0]) ? `${byDay.get(p.o[0])}, ${range}` : range)
  }
  // Group consecutive days (Mon first) with the same times.
  const order = [1, 2, 3, 4, 5, 6, 0]
  const parts: string[] = []
  let i = 0
  while (i < order.length) {
    const value = byDay.get(order[i]) ?? 'closed'
    let j = i
    while (j + 1 < order.length && (byDay.get(order[j + 1]) ?? 'closed') === value) j++
    const label = i === j ? DAY_SHORT[order[i]] : `${DAY_SHORT[order[i]]}-${DAY_SHORT[order[j]]}`
    parts.push(`${label} ${value}`)
    i = j + 1
  }
  return parts.join('; ')
}

/** The phone's own UTC offset, used when someone enters hours on the spot. */
export const localUtcOffset = () => -new Date().getTimezoneOffset()

/** Same hours (ignoring the time zone)? Used to count "these hours are right" confirmations. */
export function sameHours(a: Hours | null | undefined, b: Hours | null | undefined) {
  return hoursToText(a) === hoursToText(b)
}
