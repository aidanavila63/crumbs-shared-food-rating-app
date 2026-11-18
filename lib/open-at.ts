// U16 (Round 87): the "Open" filter on Places. Round 91 (Aidan: "7 tonight" was confusing):
// "For dinner" = open at some point 5–10 pm, "Night out" = open at some point 11 pm–2 am.
import { openStatus, type Hours } from './place-info.ts'

/** null = any time · 'now' · 'dinner' · 'late' · a time you pick ("2026-11-20T19:30") */
export type OpenAt = null | 'now' | 'dinner' | 'late' | string

const at = (base: Date, dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** Every half hour from `from` to `to` (both included), skipping what's already past. */
function halfHours(from: Date, to: Date, now: Date) {
  const out: Date[] = []
  for (let t = new Date(Math.max(from.getTime(), now.getTime())); t <= to; t = new Date(t.getTime() + 30 * 60_000))
    out.push(t)
  return out
}

/** The moments an "Open" choice checks (open at any one of them counts). */
export function openAtTimes(choice: OpenAt, now = new Date()): Date[] {
  if (!choice) return []
  if (choice === 'now') return [now]
  if (choice === 'dinner') {
    // tonight 5–10 pm; once it's past 10 pm, tomorrow's
    const day = now.getHours() >= 22 ? 1 : 0
    return halfHours(at(now, day, 17), at(now, day, 22), now)
  }
  if (choice === 'late') {
    // tonight 11 pm–2 am; in the small hours, the rest of this one
    const day = now.getHours() < 2 ? -1 : 0
    return halfHours(at(now, day, 23), at(now, day + 1, 2), now)
  }
  const picked = new Date(choice)
  return Number.isNaN(picked.getTime()) ? [] : [picked]
}

/** Kept for older callers: the first moment checked. */
export function openAtDate(choice: OpenAt, now = new Date()): Date | null {
  return openAtTimes(choice, now)[0] ?? null
}

/** Does a place with these hours fit the choice? Places without hours don't. */
export function openAtMatches(hours: Hours | null | undefined, choice: OpenAt, now = new Date()) {
  if (!choice) return true
  return openAtTimes(choice, now).some((t) => openStatus(hours, t)?.open === true)
}

export function openAtLabel(choice: OpenAt) {
  if (!choice) return null
  if (choice === 'now') return 'Open now'
  if (choice === 'dinner') return 'Open for dinner'
  if (choice === 'late') return 'Open for a night out'
  const picked = openAtDate(choice)
  return picked
    ? `Open ${picked.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
    : null
}
