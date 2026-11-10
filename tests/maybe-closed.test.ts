import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maybeClosedText, readMaybeClosed } from '../lib/maybe-closed.ts'

test('maybe closed: needs 2+ groups, ignores junk', () => {
  assert.equal(readMaybeClosed(null), null)
  assert.equal(readMaybeClosed({ groups: 1, last: '2026-11-01' }), null)
  assert.equal(readMaybeClosed('nope'), null)
  assert.deepEqual(readMaybeClosed({ groups: 2, last: '2026-11-01' }), { groups: 2, last: '2026-11-01' })
  assert.deepEqual(readMaybeClosed({ groups: '3' }), { groups: 3, last: null })
})

test('maybe closed: wording', () => {
  const today = new Date(2026, 10, 8)
  assert.equal(maybeClosedText({ groups: 2, last: '2026-11-08' }, today), 'People from 2 groups said it looked closed, most recently today. Check before you go.')
  assert.equal(maybeClosedText({ groups: 2, last: '2026-11-07' }, today), 'People from 2 groups said it looked closed, most recently yesterday. Check before you go.')
  assert.equal(maybeClosedText({ groups: 3, last: '2026-11-03' }, today), 'People from 3 groups said it looked closed, most recently 5 days ago. Check before you go.')
  assert.equal(maybeClosedText({ groups: 2, last: '2026-10-01' }, today), 'People from 2 groups said it looked closed, most recently Oct 1. Check before you go.')
  assert.equal(maybeClosedText({ groups: 2, last: null }, today), 'People from 2 groups said it looked closed. Check before you go.')
})
