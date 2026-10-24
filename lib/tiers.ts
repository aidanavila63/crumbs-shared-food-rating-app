// Contributor tiers: the more you help build Crumbs' own restaurant data, the more you get.
// Points: fact 3 · menu dish 1 · check 1 · +5 when others back up your fact (it becomes Crumbs' own).
// Max 40 points a day, and repeat answers within a detail's refresh window earn nothing.
export type Tier = {
  level: number
  name: string
  emoji: string
  min: number
  /** Daily allowances on things that cost Crumbs money or shared quota. */
  limits: { ai: number; explore: number; menuImport: number }
  perk: string
}

export const TIERS: Tier[] = [
  {
    level: 0,
    name: 'Taster',
    emoji: '🌱',
    min: 0,
    limits: { ai: 5, explore: 15, menuImport: 3 },
    perk: 'The basics',
  },
  {
    level: 1,
    name: 'Regular',
    emoji: '🍴',
    min: 25,
    limits: { ai: 10, explore: 30, menuImport: 6 },
    perk: '2× AI ideas, Explore and menu imports',
  },
  {
    level: 2,
    name: 'Local guide',
    emoji: '🧭',
    min: 100,
    limits: { ai: 20, explore: 60, menuImport: 12 },
    perk: '4× daily allowances',
  },
  {
    level: 3,
    name: 'Insider',
    emoji: '⭐',
    min: 300,
    limits: { ai: 40, explore: 120, menuImport: 25 },
    perk: '8× allowances + early features',
  },
  {
    level: 4,
    name: 'Legend',
    emoji: '👑',
    min: 1000,
    limits: { ai: 80, explore: 250, menuImport: 50 },
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

export const pointsFor = (c: {
  facts: number
  dishes: number
  checks: number
  verified?: number
}) => c.facts * 3 + c.dishes + c.checks + (c.verified ?? 0) * 5
