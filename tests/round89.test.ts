import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changedPrice, cleanTags, noticeHeadline, readNotice, TAP_KINDS, tapText } from '../lib/owner-tools.ts'

test('Owner says tags follow the same rules as the database', () => {
  assert.deepEqual(cleanTags([' Family-run ', 'family-run', 'Since  1987', '']), {
    tags: ['Family-run', 'Since 1987'],
    error: null,
  })
  assert.match(cleanTags(['see www.rosa.com']).error!, /links/)
  assert.match(cleanTags(['x']).error!, /2 to 30/)
  assert.match(cleanTags(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']).error!, /Up to 6/)
})

test('changing all prices rounds to 5 cents like owner_bulk_price', () => {
  assert.equal(changedPrice(3.99, 10), 4.4)
  assert.equal(changedPrice(4.39, 10), 4.85)
  assert.equal(changedPrice(4.5, 10), 4.95)
  assert.equal(changedPrice(20, -50), 10)
  assert.equal(changedPrice(9999, 100), 9999.95)
})

test('tap counts: small numbers stay hidden, trend only with something to compare', () => {
  assert.deepEqual(tapText(undefined), { now: '0', trend: '' })
  assert.deepEqual(tapText({ last30: null, before: 10 }), { now: 'fewer than 3', trend: '' })
  assert.deepEqual(tapText({ last30: 12, before: 0 }), { now: '12', trend: '' })
  assert.equal(tapText({ last30: 15, before: 10 }).trend, '↑ 50% on the 30 days before')
  assert.equal(tapText({ last30: 5, before: 10 }).trend, '↓ 50% on the 30 days before')
  assert.equal(tapText({ last30: 10, before: 10 }).trend, 'same as the 30 days before')
})

test('the big-change notice reads naturally', () => {
  assert.equal(readNotice({ kind: 'nope' }), null)
  assert.equal(readNotice(null), null)
  const renamed = readNotice({ kind: 'renamed', old: 'Rosa Taqueria' })!
  assert.equal(noticeHeadline(renamed, 'Rosa Cocina', null), 'New name! Rosa Cocina used to be Rosa Taqueria.')
  assert.equal(noticeHeadline({ kind: 'moved' }, 'Rosa', '99 New Ave'), 'We’ve moved to 99 New Ave.')
  assert.equal(noticeHeadline({ kind: 'closed' }, 'Rosa', null), 'Rosa has closed for good.')
})

test('the app and the database count the same kinds of taps', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261126_round89.sql', import.meta.url), 'utf8')
  const listed = sql.match(/kind in \(([^)]+)\)/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1))
  assert.deepEqual([...listed].sort(), TAP_KINDS.map((k) => k.id).sort())
})
