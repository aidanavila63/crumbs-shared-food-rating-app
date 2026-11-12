// Allowances (#budgets): anything that costs money or uses a free quota is checked against the
// person's daily allowance and Crumbs' overall budget before it runs. See usage_budgets in SQL.
export type AllowanceKind = 'ai' | 'menu_import' | 'menu_photo_ai' | 'explore' | 'google' | 'website'
export type Allowance = {
  ok: boolean
  reason?: 'personal' | 'budget_day' | 'budget_month' | 'signin' | 'unavailable'
  limit?: number
}

/**
 * Asks the database for one use. Round 74: if the check itself fails (database hiccup), the answer
 * is "no" — nothing that costs money runs without its budget being counted. (It used to say yes,
 * from the days before the v4 update existed.)
 */
export async function takeAllowance(supabase: any, kind: AllowanceKind): Promise<Allowance> {
  try {
    const { data, error } = await supabase.rpc('use_allowance', { what: kind })
    if (error || !data) return { ok: false, reason: 'unavailable' }
    return data as Allowance
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export function allowanceMessage(a: Allowance, what: string) {
  if (a.reason === 'personal')
    return `That’s your ${what} for today (${a.limit}). Answering quick questions raises it.`
  if (a.reason === 'budget_day' || a.reason === 'budget_month')
    return `Crumbs has used today’s ${what} budget — try again tomorrow.`
  if (a.reason === 'unavailable') return 'Couldn’t check the budget just now — try again in a moment.'
  return 'Please sign in first'
}
