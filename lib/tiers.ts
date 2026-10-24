// Contributor tiers: the more NEW restaurant info you add to Crumbs, the bigger your daily
// allowances. Points are deliberately small and only for new info (see POINTS); just using the app
// (logging visits, receipts, imports, ticking dishes) feeds the data but earns nothing. Points
// count for 6 months, so a tier has to be kept up. Mirrors the database (tier_for_points,
// usage_budgets) — the server's numbers win when they differ.
export type Tier = {
  level: number
  name: string
  emoji: string
  min: number
  /** Daily allowances on things that cost Crumbs money or shared quota (usage_budgets.per_tier). */
  limits: { ai: number; explore: number; menuImport: number }
  perk: string
}

/** What earns points (and nothing else does). */
export const POINTS = {
  detail: 2, // a missing detail, Crumbs' own copy of one, a change that applies, or a due re-check
  backed: 2, // others independently said the same thing
  menuPhoto: 3, // a menu photo that adds 3+ new dishes (once a quarter per restaurant)
  dailyCap: 20,
  windowDays: 180,
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
    min: 25,
    limits: { ai: 4, explore: 20, menuImport: 2 },
    perk: 'A few more AI ideas and Explore searches',
  },
  {
    level: 2,
    name: 'Local guide',
    emoji: '🧭',
    min: 75,
    limits: { ai: 5, explore: 25, menuImport: 3 },
    perk: 'More of everything',
  },
  {
    level: 3,
    name: 'Insider',
    emoji: '⭐',
    min: 200,
    limits: { ai: 6, explore: 30, menuImport: 3 },
    perk: 'Bigger allowances + early features',
  },
  {
    level: 4,
    name: 'Legend',
    emoji: '👑',
    min: 500,
    limits: { ai: 8, explore: 40, menuImport: 4 },
    perk: 'The most of everything + a say in what’s next',
  },
]

export const tierFor = (points: number) =>
  [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0]

/** Progress (0-100) towards the next tier, and how many points that needs. */
export function nextTier(points: number) {
  const now = tierFor(points)
  const next = TIERS[now.level + 1]
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
