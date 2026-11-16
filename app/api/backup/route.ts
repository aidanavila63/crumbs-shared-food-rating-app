// #89 Backups. Round 77: the weekly one has its own scheduled job again (vercel.json, Mondays),
// calling GET here with the scheduler's secret, so the daily chores can't squeeze it out (E23).
// POST is Admin → Backups → "Back up now". Needs SUPABASE_SERVICE_ROLE_KEY in Vercel.
// Admin → Backups lists and downloads the files.
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { runBackup } from '@/lib/run-backup'
import { keepErrors } from '@/lib/server-errors'

export const maxDuration = 60

/** Manual run with the scheduler's secret. */
async function handleGET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: 'Not allowed' }, { status: 401 })
  return runBackup()
}

/** Admin → Backups → "Back up now". */
async function handlePOST() {
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

// Third pass #9: unexpected failures go into Admin → Errors (Vercel keeps logs an hour).
export const GET = keepErrors('GET /api/backup', handleGET)
export const POST = keepErrors('POST /api/backup', handlePOST)
