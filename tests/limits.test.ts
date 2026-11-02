import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitAlerts, monthPace } from '../lib/limits.ts'
import { fromShare } from '../lib/maps-link.ts'

const report = (over: Partial<Parameters<typeof limitAlerts>[0]> = {}) => ({
  db_bytes: 10 * 1024 * 1024,
  storage_bytes: 0,
  budgets: [],
  ...over,
})

test('monthPace stretches month-to-date to the whole month', () => {
  assert.equal(monthPace(100, new Date(2026, 9, 10)), 310)
  assert.equal(monthPace(0, new Date(2026, 1, 1)), 0)
})

test('no alerts when everything is low', () => {
  assert.deepEqual(limitAlerts(report()), [])
})

test('database and storage warn at 80%, stop at 95%', () => {
  const a = limitAlerts(report({ db_bytes: 420 * 1024 * 1024, storage_bytes: 1000 * 1024 * 1024 }))
  assert.deepEqual(
    a.map((x) => [x.kind, x.level]),
    [
      ['db_size', 'warn'],
      ['storage_size', 'stop'],
    ],
  )
})

test('budgets: daily at 90%, monthly at 80%, pace as info', () => {
  const b = (over: object) => ({
    kind: 'ai',
    note: 'AI ideas',
    daily_total: 150,
    monthly_total: 3000,
    today: 0,
    month: 0,
    ...over,
  })
  const day = new Date(2026, 9, 10)
  assert.deepEqual(
    limitAlerts(report({ budgets: [b({ today: 140 })] }), day).map((x) => x.kind),
    ['daily_ai'],
  )
  assert.deepEqual(
    limitAlerts(report({ budgets: [b({ month: 2500 })] }), day).map((x) => [x.kind, x.level]),
    [['month_ai', 'warn']],
  )
  assert.deepEqual(
    limitAlerts(report({ budgets: [b({ month: 1200 })] }), day).map((x) => [x.kind, x.level]),
    [['pace_ai', 'info']],
  )
})

test('fromShare finds a map link or falls back to a name', () => {
  const p = (o: Record<string, string>) => new URLSearchParams(o)
  assert.deepEqual(fromShare(p({ text: 'Hana Ramen https://maps.app.goo.gl/abc123' })), {
    link: 'https://maps.app.goo.gl/abc123',
    name: null,
  })
  assert.deepEqual(fromShare(p({ title: 'Hana Ramen', url: 'https://hanaramen.ca' })), {
    link: null,
    name: 'Hana Ramen',
  })
  assert.deepEqual(fromShare(p({})), { link: null, name: null })
})
