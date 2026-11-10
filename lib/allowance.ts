// Allowances (#budgets): anything that costs money or uses a free quota is checked against the
// person's daily allowance and Crumbs' overall budget before it runs. See usage_budgets in SQL.
export type AllowanceKind = 'ai' | 'menu_import' | 'menu_photo_ai' | 'explore' | 'google' | 'website'
export type Allowance = {
  ok: boolean
  reason?: 'personal' | 'budget_day' | 'budget_month' | 'signin'
  limit?: number
}

/** Asks the database for one use. Before the v4 update exists, everything is allowed (old behaviour). */
export async function takeAllowance(supabase: any, kind: AllowanceKind): Promise<Allowance> {
  try {
    const { data, error } = await supabase.rpc('use_allowance', { what: kind })
    if (error) return { ok: true }
    return data as Allowance
  } catch {
    return { ok: true }
  }
}

export function allowanceMessage(a: Allowance, what: string) {
  if (a.reason === 'personal')
    return `That’s your ${what} for today (${a.limit}). Answering quick questions raises it.`
  if (a.reason === 'budget_day' || a.reason === 'budget_month')
    return `Crumbs has used today’s ${what} budget — try again tomorrow.`
  return 'Please sign in first'
}
