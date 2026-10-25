// #89 Weekly automatic backup (scheduled in vercel.json). Only runs with the scheduler's secret
// (CRON_SECRET) and the database server key (SUPABASE_SERVICE_ROLE_KEY) set in Vercel; without
// them it does nothing. Admin → Backups lists and downloads the files.
import { gzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { BACKUP_BUCKET, BACKUP_TABLES, backupName, oldBackups } from '@/lib/backup'

export const maxDuration = 60

/** The weekly scheduler. */
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

async function runBackup() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url)
    return Response.json(
      { error: 'Add SUPABASE_SERVICE_ROLE_KEY in Vercel to turn on backups' },
      { status: 503 },
    )

  const db = createClient(url, key, { auth: { persistSession: false } })
  const tables: Record<string, unknown[]> = {}
  const missing: string[] = []
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from(table)
        .select('*')
        .range(from, from + 999)
      if (error) {
        missing.push(table) // table not there yet (older database) — skip it
        break
      }
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    tables[table] = rows
  }
  const now = new Date()
  const file = gzipSync(
    JSON.stringify({ app: 'crumbs', version: 1, created_at: now.toISOString(), tables }),
  )
  const name = backupName(now)
  const { error } = await db.storage
    .from(BACKUP_BUCKET)
    .upload(name, file, { contentType: 'application/gzip', upsert: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { data: files } = await db.storage.from(BACKUP_BUCKET).list('', { limit: 100 })
  const old = oldBackups((files ?? []).map((f) => f.name))
  if (old.length) await db.storage.from(BACKUP_BUCKET).remove(old)
  return Response.json({
    saved: name,
    bytes: file.length,
    rows: Object.values(tables).reduce((n, rows) => n + rows.length, 0),
    skipped: missing,
    removed: old,
  })
}
