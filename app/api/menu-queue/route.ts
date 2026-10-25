// #214 Admin → Menu PDFs → "Read now": reads queued menu PDFs straight away (within the leftover
// monthly AI allowance). The daily job does the same by itself in the last days of each month.
import { createClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { leftoverAi, processMenuQueue } from '@/lib/menu-queue'
import type { LimitReport } from '@/lib/limits'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const session = await createSessionClient()
  const { data } = await session.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const { data: me } = await session
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle()
  if (!me?.is_admin) return Response.json({ error: 'Admins only' }, { status: 403 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    return Response.json(
      { error: 'Add SUPABASE_SERVICE_ROLE_KEY in Vercel first' },
      { status: 503 },
    )
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { data: report, error } = await db.rpc('limit_report')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const left = leftoverAi((report as LimitReport).budgets)
  const done = await processMenuQueue(db, left)
  return Response.json({ ...done, left })
}
