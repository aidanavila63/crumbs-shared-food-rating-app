import test from 'node:test'
import assert from 'node:assert/strict'
import { pollSummary, pollTime } from '../lib/day-poll.ts'

test('pick-a-day: soonest first, favourite = most votes (earliest on a tie)', () => {
  const { sorted, favourite, most } = pollSummary([
    { id: 'b', starts_at: '2026-12-03T00:00:00.000Z', votes: ['x', 'y'] },
    { id: 'a', starts_at: '2026-12-01T00:00:00.000Z', votes: ['x'] },
    { id: 'c', starts_at: '2026-12-02T00:00:00.000Z', votes: ['y', 'z'] },
  ])
  assert.deepEqual(sorted.map((o) => o.id), ['a', 'c', 'b'])
  assert.equal(favourite, 'c')
  assert.equal(most, 2)
  assert.equal(pollSummary([{ id: 'a', starts_at: '2026-12-01', votes: [] }]).favourite, null)
})

test('pick-a-day: only real times that haven’t passed', () => {
  const now = new Date('2026-11-18T12:00:00')
  assert.equal(pollTime('', now), null)
  assert.equal(pollTime('nonsense', now), null)
  assert.equal(pollTime('2026-11-17T19:00', now), null)
  assert.equal(pollTime('2026-11-20T19:00', now), new Date('2026-11-20T19:00').toISOString())
})
