// Server side: daily allowance by contributor tier (#tiers). Best effort on serverless — each
// instance counts on its own — so it's a fairness guard, not a hard quota.
import { TIERS, type Tier } from './tiers.ts'
import { tooManyRequests } from './rate-limit.ts'

const DAY = 24 * 60 * 60 * 1000
const cache = new Map<string, { at: number; tier: Tier }>()

export async function tierOf(supabase: any, userId: string): Promise<Tier> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.tier
  const [{ data }, { data: me }] = await Promise.all([
    supabase.rpc('my_contributions'),
    supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle(),
  ])
  // Admins (you) get the top tier; everyone else by what they've contributed.
  const level = me?.is_admin ? TIERS.length - 1 : Number(data?.tier ?? 0)
  const tier = TIERS[Math.min(TIERS.length - 1, Math.max(0, level))]
  cache.set(userId, { at: Date.now(), tier })
  return tier
}

const DB_KIND: Record<keyof Tier['limits'], string> = {
  ai: 'ai',
  explore: 'explore',
  menuImport: 'menu_import',
}

/** Message when this user (or Crumbs overall) has used today's allowance of `kind`, else null. */
export async function overDailyLimit(supabase: any, userId: string, kind: keyof Tier['limits']) {
  // The database keeps the real count (per person + overall budget) once the v4 update has run.
  const { data, error } = await supabase.rpc('use_allowance', { what: DB_KIND[kind] })
  if (!error && data) {
    if (data.ok) return null
    return data.reason === 'personal'
      ? `That’s today’s limit for you (${data.limit}). Answering quick questions in Crumbs raises it.`
      : 'Crumbs has used today’s budget for this — try again tomorrow.'
  }
  const tier = await tierOf(supabase, userId)
  return tooManyRequests(`day:${kind}:${userId}`, tier.limits[kind], DAY)
    ? `That’s today’s limit for ${tier.name} (${tier.limits[kind]}). Help build Crumbs’ restaurant info to raise it.`
    : null
}
