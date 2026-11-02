// #89 Backups on demand. The weekly one now runs from the daily job (app/api/daily, Mondays);
// GET here still works with the scheduler's secret. Needs SUPABASE_SERVICE_ROLE_KEY in Vercel.
// Admin → Backups lists and downloads the files.
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { runBackup } from '@/lib/run-backup'

export const maxDuration = 60

/** Manual run with the scheduler's secret. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: 'Not allowed' }, { status: 401 })
  return runBackup()
}

/** Admin → Backups → "Back up now". */
export async function POST() {
  const supabase = await createSessionClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return Response.json({ error: 'Please sign in first' }, { status: 401 })
  const { data: me } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle()
  if (!me?.is_admin) return Response.json({ error: 'Admins only' }, { status: 403 })
  return runBackup()
}
