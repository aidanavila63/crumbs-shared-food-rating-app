// #89 Makes one backup file (every table, gzipped JSON) in the private backups bucket and keeps
// the newest few. Used by the weekly backup job and Admin → Backups → "Back up now".
// Round 77: tables are read a page at a time in primary-key order (E24; before, pages had no
// order, so a big table could come back with rows missing or twice), a few tables at once, and
// row counts per table go in the run record. When the R2_* backup settings are in Vercel, a copy
// also goes to Cloudflare R2, off Supabase (S14).
import { gzipSync } from 'node:zlib'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'
import { BACKUP_BUCKET, BACKUP_TABLES, backupName, oldBackups } from '@/lib/backup'
import { recordJob } from '@/lib/jobs'
import { listedKeys } from '@/lib/r2-list'

const PAGE = 1000
const AT_ONCE = 4

async function readTable(db: any, table: string) {
  const rows: unknown[] = []
  for (let page = 0; ; page += 1) {
    const { data, error } = await db.rpc('backup_rows', { t: table, page, size: PAGE })
    if (error) {
      // Before the Round 77 SQL has run: the old way (no order), so backups keep working.
      if (/backup_rows/.test(error.message) || error.code === 'PGRST202') return readOld(db, table)
      return null // table not there yet (older database): skip it
    }
    const batch = (data ?? []) as unknown[]
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

async function readOld(db: any, table: string) {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) return null
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

/** Off-site copy on Cloudflare R2 (private bucket), newest few kept. Off until the settings exist. */
export function r2Backups() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BACKUP_BUCKET) return null
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BACKUP_BUCKET}`,
  }
}


async function copyToR2(name: string, file: Buffer) {
  const r2 = r2Backups()
  if (!r2) return { r2: 'off' }
  try {
    const put = await r2.client.fetch(`${r2.base}/${name}`, {
      method: 'PUT',
      body: new Uint8Array(file),
      headers: { 'content-type': 'application/gzip' },
    })
    if (!put.ok) return { r2: `failed (${put.status})` }
    const list = await r2.client.fetch(`${r2.base}?list-type=2&max-keys=200`)
    const old = list.ok ? oldBackups(listedKeys(await list.text())) : []
    await Promise.all(old.map((key) => r2.client.fetch(`${r2.base}/${key}`, { method: 'DELETE' })))
    return { r2: 'saved', r2_removed: old }
  } catch (error: any) {
    return { r2: `failed (${error?.message ?? 'network'})` }
  }
}

export async function runBackup() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url)
    return Response.json(
      { error: 'Add SUPABASE_SERVICE_ROLE_KEY in Vercel to turn on backups' },
      { status: 503 },
    )

  const db = createClient(url, key, { auth: { persistSession: false } })
  return recordJob(db, 'backup', async () => {
    const tables: Record<string, unknown[]> = {}
    const missing: string[] = []
    const queue = [...BACKUP_TABLES] as string[]
    await Promise.all(
      Array.from({ length: AT_ONCE }, async () => {
        for (let table = queue.shift(); table; table = queue.shift()) {
          const rows = await readTable(db, table)
          if (rows) tables[table] = rows
          else missing.push(table)
        }
      }),
    )
    const now = new Date()
    const file = gzipSync(
      JSON.stringify({ app: 'crumbs', version: 1, created_at: now.toISOString(), tables }),
    )
    const name = backupName(now)
    const { error } = await db.storage
      .from(BACKUP_BUCKET)
      .upload(name, file, { contentType: 'application/gzip', upsert: true })
    if (error) throw new Error(error.message)

    const { data: files } = await db.storage.from(BACKUP_BUCKET).list('', { limit: 100 })
    const old = oldBackups((files ?? []).map((f) => f.name))
    if (old.length) await db.storage.from(BACKUP_BUCKET).remove(old)
    const counts = Object.fromEntries(
      Object.entries(tables)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([table, rows]) => [table, rows.length]),
    )
    return {
      saved: name,
      bytes: file.length,
      rows: Object.values(counts).reduce((n, c) => n + c, 0),
      counts,
      skipped: missing.sort(),
      removed: old,
      ...(await copyToR2(name, file)),
    }
  })
}
