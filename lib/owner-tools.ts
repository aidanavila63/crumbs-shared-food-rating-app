// Round 89 owner tools: the small rules shared by the owner screens and the restaurant page.
// Kept in step with supabase/migrations/20261126_round89.sql (owner_set_tags, owner_bulk_price,
// count_tap, owner_tools).

export type TapKind = 'call' | 'website' | 'directions' | 'book' | 'menu' | 'table_menu'
export const TAP_KINDS: { id: TapKind; label: string }[] = [
  { id: 'call', label: 'Calls' },
  { id: 'directions', label: 'Directions' },
  { id: 'website', label: 'Website' },
  { id: 'book', label: 'Book a table' },
  { id: 'menu', label: 'Menu views' },
  { id: 'table_menu', label: 'Table QR scans' },
]

/** null = 1 or 2 (hidden, "fewer than 3") */
export type TapCount = { last30: number | null; before: number | null }
export type OwnerTools = { city: string | null; slug: string | null; taps: Partial<Record<TapKind, TapCount>> }

export function tapText(count: TapCount | undefined) {
  if (!count) return { now: '0', trend: '' }
  const now = count.last30 === null ? 'fewer than 3' : String(count.last30)
  if (count.last30 === null || count.before === null || !count.before) return { now, trend: '' }
  const change = Math.round(((count.last30 - count.before) / count.before) * 100)
  if (!change) return { now, trend: 'same as the 30 days before' }
  return { now, trend: `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}% on the 30 days before` }
}

export const SUGGESTED_TAGS = [
  'Family-run',
  'Made from scratch',
  'Locally sourced',
  'Late-night',
  'Est. ',
  'Chef-owned',
  'Catering',
  'Private room',
]

/** Same rules as owner_set_tags: trimmed, single spaces, 2–30 characters, no links, no repeats, up to 6. */
export function cleanTags(tags: string[]): { tags: string[]; error: string | null } {
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (!t) continue
    if (t.length < 2 || t.length > 30) return { tags: out, error: 'Each tag is 2 to 30 characters' }
    if (/(https?:|www\.|\.com\b|@)/i.test(t)) return { tags: out, error: 'Tags can’t be links or emails' }
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  if (out.length > 6) return { tags: out, error: 'Up to 6 tags' }
  return { tags: out, error: null }
}

/** owner_bulk_price: change by a percentage, rounded to 5 cents. */
export function changedPrice(price: number, pct: number) {
  return Math.min(9999.95, Math.round(price * (1 + pct / 100) * 20) / 20)
}

export type OwnerNotice = {
  kind: 'moved' | 'renamed' | 'closed'
  old?: string | null
  text?: string | null
  at?: string
  until?: string
}

/** The line on the restaurant page. */
export function noticeHeadline(n: OwnerNotice, name: string, address: string | null) {
  if (n.kind === 'renamed') return n.old ? `New name! ${name} used to be ${n.old}.` : `New name: ${name}.`
  if (n.kind === 'moved') return address ? `We’ve moved to ${address}.` : 'We’ve moved.'
  return `${name} has closed for good.`
}

export const readNotice = (value: unknown): OwnerNotice | null => {
  if (!value || typeof value !== 'object') return null
  const n = value as OwnerNotice
  return n.kind === 'moved' || n.kind === 'renamed' || n.kind === 'closed' ? n : null
}
