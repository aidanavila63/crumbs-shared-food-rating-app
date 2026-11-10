// Part three: "Might be closed" — people from 2+ groups said lately that it looked closed, but the
// page still says open. Banner only: the page itself changes the usual way (agreement or owner).

export type MaybeClosed = { groups: number; last: string | null }

/** Turn the database answer into something safe to show, or null. */
export function readMaybeClosed(data: unknown): MaybeClosed | null {
  if (!data || typeof data !== 'object') return null
  const groups = Number((data as any).groups)
  if (!Number.isFinite(groups) || groups < 2) return null
  const last = typeof (data as any).last === 'string' ? (data as any).last : null
  return { groups: Math.floor(groups), last }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function maybeClosedText(m: MaybeClosed, today = new Date()): string {
  let when = ''
  if (m.last && /^\d{4}-\d{2}-\d{2}$/.test(m.last)) {
    const [y, mo, d] = m.last.split('-').map(Number)
    const then = Date.UTC(y, mo - 1, d)
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    const days = Math.round((now - then) / 86400000)
    when = days <= 0 ? ', most recently today' : days === 1 ? ', most recently yesterday' : days < 14 ? `, most recently ${days} days ago` : `, most recently ${MONTHS[mo - 1]} ${d}`
  }
  return `People from ${m.groups} groups said it looked closed${when}. Check before you go.`
}
