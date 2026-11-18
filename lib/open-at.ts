// U16 (Round 87): the "Open" filter on Places.
/** U16 (Round 87): open now, at 7 tonight, or at a time you pick ("2026-11-20T19:30"). */
export type OpenAt = null | 'now' | 'tonight' | string

/** The moment an "Open at" choice means. */
export function openAtDate(choice: OpenAt, now = new Date()): Date | null {
  if (!choice) return null
  if (choice === 'now') return now
  if (choice === 'tonight') {
    const at = new Date(now)
    at.setHours(19, 0, 0, 0)
    return at < now ? now : at
  }
  const at = new Date(choice)
  return Number.isNaN(at.getTime()) ? null : at
}

export function openAtLabel(choice: OpenAt) {
  if (!choice) return null
  if (choice === 'now') return 'Open now'
  if (choice === 'tonight') return 'Open at 7 tonight'
  const at = openAtDate(choice)
  return at
    ? `Open ${at.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
    : null
}
