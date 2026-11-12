import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKUP_TABLES, NOT_BACKED_UP, backupName, oldBackups } from '../lib/backup.ts'

test('backups: names and keeping the newest', () => {
  assert.equal(backupName(new Date('2026-10-26T07:17:00Z')), 'crumbs-2026-10-26.json.gz')
  const names = [
    'crumbs-2026-09-01.json.gz',
    'crumbs-2026-10-20.json.gz',
    'crumbs-2026-10-13.json.gz',
    'notes.txt',
  ]
  assert.deepEqual(oldBackups(names, 2), ['crumbs-2026-09-01.json.gz'])
  assert.ok(
    BACKUP_TABLES.includes('places') && !BACKUP_TABLES.includes('push_subscriptions' as any),
  )
})

// Nov 15: the weekly backup had quietly fallen 13 tables behind (two of them added the same
// week). Every table the SQL files create must now be in one list or the other.
test('backups: every table is either backed up or left out on purpose', () => {
  const sqlDir = fileURLToPath(new URL('../supabase', import.meta.url))
  const files = [
    join(sqlDir, 'schema.sql'),
    join(sqlDir, 'fresh-project-additions.sql'),
    ...readdirSync(join(sqlDir, 'migrations'))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => join(sqlDir, 'migrations', name)),
  ]
  const created = new Set<string>()
  for (const file of files) {
    const sql = readFileSync(file, 'utf8')
    for (const m of sql.matchAll(/create table(?: if not exists)?\s+(?:public\.)?([a-z_0-9]+)/gi))
      created.add(m[1].toLowerCase())
    for (const m of sql.matchAll(/drop table(?: if exists)?\s+(?:public\.)?([a-z_0-9]+)/gi))
      created.delete(m[1].toLowerCase())
  }
  assert.ok(created.size >= 66, `only found ${created.size} tables in the SQL files`)
  const kept = new Set<string>(BACKUP_TABLES)
  const skipped = new Set<string>(NOT_BACKED_UP)
  const forgotten = [...created].filter((name) => !kept.has(name) && !skipped.has(name)).sort()
  assert.deepEqual(forgotten, [], 'add these to BACKUP_TABLES or NOT_BACKED_UP in lib/backup.ts')
  const both = [...kept].filter((name) => skipped.has(name))
  assert.deepEqual(both, [], 'a table is in both lists')
  const gone = [...kept, ...skipped].filter((name) => !created.has(name)).sort()
  assert.deepEqual(gone, [], 'these names are in lib/backup.ts but no SQL file creates them')
  assert.equal(kept.size, BACKUP_TABLES.length, 'a table is listed twice')
})
