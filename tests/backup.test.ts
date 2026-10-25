import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_TABLES, backupName, oldBackups } from '../lib/backup.ts'

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
