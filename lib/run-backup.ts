// #89 Makes one backup file (every table, gzipped JSON) in the private backups bucket and keeps
// the newest few. Used by the daily job and Admin → Backups → "Back up now".
import { gzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { BACKUP_BUCKET, BACKUP_TABLES, backupName, oldBackups } from '@/lib/backup'

export async function runBackup() {
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
