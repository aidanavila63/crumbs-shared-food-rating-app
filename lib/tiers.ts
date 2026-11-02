// Contributor tiers: the more NEW restaurant info you add to Crumbs, the bigger your daily
// allowances. Points are small and only for new info (see POINTS); just using the app (logging
// visits, receipts, imports, ticking dishes) feeds the data but earns nothing. No daily cap —
// instead points expire (90 days), so a tier has to be kept up. Defaults mirror the database's
// point_rules / usage_budgets; the server's numbers (Admin → Points) win when they differ.
export type Tier = {
  level: number
  name: string
  emoji: string
  min: number
  /** Daily allowances on things that cost Crumbs money or shared quota (usage_budgets.per_tier). */
  limits: { ai: number; explore: number; menuImport: number }
  perk: string
}

/** What earns points (and nothing else does). Same names as the database's point_rules. */
export type PointRules = {
  window_days: number
  tiers: number[] // points for tiers 1..4
  detail: number // a missing detail, Crumbs' own copy of one, a change that applies, or a due re-check
  confirm: number // one of the first confirmations that makes a detail Crumbs' own
  backed: number // once, when others back up what you said
  menu_set: number // dishes per menu point step (5)
  menu_try: number // every menu_set new dishes that enter your points queue
  menu_ok: number // every menu_set of your dishes confirmed (item + price) by 2 others or the owner
  menu_queue: number // dishes that can sit in your points queue at once; more wait in line
  /** #171 per-day caps by tier 0..4 (null = unlimited) */
  day_caps?: DayCaps
}
export type DayCaps = Record<'fact' | 'vote' | 'price' | 'groups', (number | null)[]>
export const DAY_CAPS: DayCaps = {
  fact: [40, 80, 150, 300, null],
  vote: [150, 300, 500, 1000, null],
  price: [40, 80, 150, 300, null],
  /** groups you can own at once (not a daily number) */
  groups: [1, 1, 2, 3, null],
}
/** "80 details a day" / "unlimited details" at a tier. */
export function detailCapText(level: number, caps: DayCaps = DAY_CAPS) {
  const n = caps.fact[Math.min(4, Math.max(0, level))]
  return n == null ? 'unlimited details' : `${n} details a day`
}
export const POINTS: PointRules = {
  window_days: 90,
  tiers: [30, 100, 250, 600],
  detail: 2,
  confirm: 1,
  backed: 2,
  menu_set: 5,
  menu_try: 1,
  menu_ok: 2,
  menu_queue: 50,
  day_caps: DAY_CAPS,
}

export const TIERS: Tier[] = [
  {
    level: 0,
    name: 'Taster',
    emoji: '🌱',
    min: 0,
    limits: { ai: 3, explore: 15, menuImport: 2 },
    perk: 'The basics',
  },
  {
    level: 1,
    name: 'Regular',
    emoji: '🍴',
    min: 30,
    limits: { ai: 4, explore: 20, menuImport: 2 },
    perk: 'A few more AI ideas and Explore searches',
  },
  {
    level: 2,
    name: 'Local guide',
    emoji: '🧭',
    min: 100,
    limits: { ai: 5, explore: 25, menuImport: 3 },
    perk: 'More of everything',
  },
  {
    level: 3,
    name: 'Insider',
    emoji: '⭐',
    min: 250,
    limits: { ai: 6, explore: 30, menuImport: 3 },
    perk: 'Bigger allowances + early features',
  },
  {
    level: 4,
    name: 'Legend',
    emoji: '👑',
    min: 600,
    limits: { ai: 8, explore: 40, menuImport: 4 },
    perk: 'The most of everything + a say in what’s next',
  },
]

/** The tiers with the server's thresholds (Admin can change them). */
export const tiersWith = (mins: number[] = POINTS.tiers) =>
  TIERS.map((t) => ({ ...t, min: t.level === 0 ? 0 : (mins[t.level - 1] ?? t.min) }))

export const tierFor = (points: number, mins?: number[]) =>
  [...tiersWith(mins)].reverse().find((t) => points >= t.min) ?? TIERS[0]

/** Progress (0-100) towards the next tier, and how many points that needs. */
export function nextTier(points: number, mins?: number[]) {
  const list = tiersWith(mins)
  const now = tierFor(points, mins)
  const next = list[now.level + 1]
  if (!next) return { next: null, pct: 100, need: 0 }
  return {
    next,
    pct: Math.round(((points - now.min) / (next.min - now.min)) * 100),
    need: next.min - points,
  }
}

/** Rough points when the server ledger isn't there (demo): details + backed-up details. */
export const pointsFor = (c: { facts: number; verified?: number }) =>
  c.facts * POINTS.detail + (c.verified ?? 0) * POINTS.backed
