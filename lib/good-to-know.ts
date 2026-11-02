// "Good to know" about a restaurant (#206 #207 #208 #140 #148 #149 #209): yes/no details anyone
// who's been can answer. 2 agreeing (or the verified owner) makes one show for everyone.
export type AttrKey =
  | 'cards'
  | 'tap'
  | 'cash_only'
  | 'takes_bookings'
  | 'walk_ins'
  | 'patio'
  | 'late_night'
  | 'byob'
  | 'licensed'
  | 'kids_menu'
  | 'high_chairs'
  | 'change_table'
  | 'step_free'
  | 'accessible_washroom'
  | 'vegan_options'
  | 'gluten_free_options'
  | 'halal_options'
  | 'parking_lot'

export type Attr = {
  key: AttrKey
  /** shown when it's a yes */
  yes: string
  /** shown when it's a confirmed no (only where a no is worth knowing) */
  no?: string
  question: string
  emoji: string
  group: string
  /** a yes that can spoil plans (shown as a warning) */
  warn?: boolean
}

export const ATTRS: Attr[] = [
  {
    key: 'cash_only',
    yes: 'Cash only',
    question: 'Cash only?',
    emoji: '💵',
    group: 'Paying',
    warn: true,
  },
  {
    key: 'cards',
    yes: 'Takes cards',
    no: 'No cards',
    question: 'Takes cards?',
    emoji: '💳',
    group: 'Paying',
  },
  { key: 'tap', yes: 'Tap to pay', question: 'Tap to pay?', emoji: '📱', group: 'Paying' },
  {
    key: 'takes_bookings',
    yes: 'Takes bookings',
    no: 'No bookings',
    question: 'Takes bookings?',
    emoji: '📅',
    group: 'Booking',
  },
  {
    key: 'walk_ins',
    yes: 'Walk-ins welcome',
    no: 'Booking needed',
    question: 'Walk-ins OK?',
    emoji: '🚶',
    group: 'Booking',
  },
  { key: 'patio', yes: 'Patio', question: 'Patio?', emoji: '☀️', group: 'Vibe & drinks' },
  {
    key: 'late_night',
    yes: 'Open late',
    question: 'Open late (after 11)?',
    emoji: '🌙',
    group: 'Vibe & drinks',
  },
  {
    key: 'licensed',
    yes: 'Serves alcohol',
    no: 'No alcohol',
    question: 'Serves alcohol?',
    emoji: '🍷',
    group: 'Vibe & drinks',
  },
  { key: 'byob', yes: 'BYOB', question: 'Bring your own?', emoji: '🍾', group: 'Vibe & drinks' },
  { key: 'kids_menu', yes: 'Kids menu', question: 'Kids menu?', emoji: '🧒', group: 'Family' },
  {
    key: 'high_chairs',
    yes: 'High chairs',
    question: 'High chairs?',
    emoji: '🪑',
    group: 'Family',
  },
  {
    key: 'change_table',
    yes: 'Change table',
    question: 'Change table?',
    emoji: '🚼',
    group: 'Family',
  },
  {
    key: 'step_free',
    yes: 'Step-free entry',
    no: 'Steps at the door',
    question: 'Step-free entry?',
    emoji: '♿',
    group: 'Access',
  },
  {
    key: 'accessible_washroom',
    yes: 'Accessible washroom',
    no: 'No accessible washroom',
    question: 'Accessible washroom?',
    emoji: '🚻',
    group: 'Access',
  },
  {
    key: 'vegan_options',
    yes: 'Vegan options',
    question: 'Vegan options?',
    emoji: '🌱',
    group: 'Diet options',
  },
  {
    key: 'gluten_free_options',
    yes: 'Gluten-free options',
    question: 'Gluten-free options?',
    emoji: '🌾',
    group: 'Diet options',
  },
  {
    key: 'halal_options',
    yes: 'Halal options',
    question: 'Halal options?',
    emoji: '🥙',
    group: 'Diet options',
  },
  {
    key: 'parking_lot',
    yes: 'Has parking',
    no: 'No parking lot',
    question: 'Own parking?',
    emoji: '🅿️',
    group: 'Parking',
  },
]

export type AttrState = {
  yes: number
  no: number
  mine: boolean | null
  owner: boolean | null
  verdict: boolean | null
}
export type AttrSummary = {
  attrs: Partial<Record<AttrKey, AttrState>>
  groups?: {
    loud: boolean
    hard_parking: boolean
    long_wait: boolean
    cash_only: boolean
    not_accessible: boolean
  } | null
}

/** What to show for everyone: confirmed facts (warnings first), then group-noticed dealbreakers. */
export function knownFacts(summary: AttrSummary | null) {
  if (!summary) return []
  const out: { label: string; emoji: string; warn: boolean; owner: boolean }[] = []
  for (const a of ATTRS) {
    const s = summary.attrs[a.key]
    if (!s || s.verdict === null || s.verdict === undefined) continue
    if (s.verdict)
      out.push({ label: a.yes, emoji: a.emoji, warn: !!a.warn, owner: s.owner !== null })
    else if (a.no)
      out.push({ label: a.no, emoji: a.emoji, warn: a.key !== 'licensed', owner: s.owner !== null })
  }
  const g = summary.groups
  // #209 dealbreakers several groups noted on their own copies (never says which groups)
  if (g?.cash_only && !out.some((f) => f.label === 'Cash only'))
    out.push({ label: 'Often cash only', emoji: '💵', warn: true, owner: false })
  if (g?.loud) out.push({ label: 'Often loud', emoji: '🔊', warn: true, owner: false })
  if (g?.long_wait) out.push({ label: 'Often a long wait', emoji: '⏳', warn: true, owner: false })
  if (g?.hard_parking) out.push({ label: 'Parking is hard', emoji: '🚗', warn: true, owner: false })
  if (g?.not_accessible && !out.some((f) => f.label === 'Steps at the door'))
    out.push({ label: 'Access can be hard', emoji: '♿', warn: true, owner: false })
  return out.sort((a, b) => Number(b.warn) - Number(a.warn))
}

/** #204 Price level from what people actually spent a head. */
export function priceLevelFromSpend(perHead: number | null | undefined) {
  if (!perHead) return null
  return perHead < 15 ? 1 : perHead < 30 ? 2 : perHead < 60 ? 3 : 4
}

/** #203 The newest date anything on the menu was added or had its price checked. */
export function menuAgeMonths(
  menu: { price_checked_at?: string | null }[],
  now = new Date(),
): number | null {
  const newest = menu
    .map((d) => d.price_checked_at)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1)
  if (!newest) return null
  return Math.floor((now.getTime() - new Date(newest).getTime()) / (30.44 * 864e5))
}
