// O4 (Round 94): the days restaurants in Ontario often change their hours, so owners can be
// asked two weeks ahead. Dates are worked out for any year (Easter by the usual Gregorian rule).

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** The n-th given weekday (0 = Sunday) of a month; n = -1 for "the one before day `before`". */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
}

function easter(y: number) {
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(y, month - 1, day))
}

const shift = (date: Date, days: number) => {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type Holiday = { date: string; name: string }

export function holidaysOf(y: number): Holiday[] {
  const e = easter(y)
  // Victoria Day: the Monday before May 25
  const may24 = new Date(Date.UTC(y, 4, 24)).getUTCDay()
  const victoria = 24 - ((may24 + 6) % 7)
  return [
    { date: iso(y, 1, 1), name: 'New Year’s Day' },
    { date: iso(y, 2, 14), name: 'Valentine’s Day' },
    { date: iso(y, 2, nthWeekday(y, 2, 1, 3)), name: 'Family Day' },
    { date: shift(e, -2), name: 'Good Friday' },
    { date: shift(e, 0), name: 'Easter Sunday' },
    { date: iso(y, 5, nthWeekday(y, 5, 0, 2)), name: 'Mother’s Day' },
    { date: iso(y, 5, victoria), name: 'Victoria Day' },
    { date: iso(y, 6, nthWeekday(y, 6, 0, 3)), name: 'Father’s Day' },
    { date: iso(y, 7, 1), name: 'Canada Day' },
    { date: iso(y, 8, nthWeekday(y, 8, 1, 1)), name: 'Civic Holiday' },
    { date: iso(y, 9, nthWeekday(y, 9, 1, 1)), name: 'Labour Day' },
    { date: iso(y, 10, nthWeekday(y, 10, 1, 2)), name: 'Thanksgiving' },
    { date: iso(y, 12, 24), name: 'Christmas Eve' },
    { date: iso(y, 12, 25), name: 'Christmas Day' },
    { date: iso(y, 12, 26), name: 'Boxing Day' },
    { date: iso(y, 12, 31), name: 'New Year’s Eve' },
  ]
}

/** Holidays from today through `days` ahead (local dates, YYYY-MM-DD). */
export function holidaysAhead(today: string, days = 14): Holiday[] {
  const y = Number(today.slice(0, 4))
  const end = shift(new Date(`${today}T00:00:00Z`), days)
  return [...holidaysOf(y), ...holidaysOf(y + 1)]
    .filter((h) => h.date >= today && h.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Is this day already covered by special hours the owner set? */
export function coveredBySpecialHours(hours: { from?: string; until?: string } | null | undefined, day: string, today: string) {
  if (!hours?.until) return false
  return (hours.from ?? today) <= day && day <= hours.until
}

/** Today in Toronto (where Crumbs' restaurants are), YYYY-MM-DD. */
export const torontoToday = (now = new Date()) =>
  now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
