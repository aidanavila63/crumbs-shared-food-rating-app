import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closedToday, currentPosts, daysText } from '../lib/posts.ts'

const post = (id: string, extra: Record<string, unknown>) =>
  ({
    id,
    restaurant_id: 'r',
    kind: 'news',
    title: id,
    body: null,
    weekdays: null,
    starts_on: null,
    ends_on: null,
    created_at: '2026-10-20T00:00:00Z',
    ...extra,
  }) as any

test('current posts for a Tuesday', () => {
  const now = new Date('2026-10-27T12:00:00') // Tuesday
  const c = currentPosts(
    [
      post('wings', { kind: 'special', weekdays: [2] }),
      post('pasta', { kind: 'special', weekdays: [4] }),
      post('pumpkin', { kind: 'limited', starts_on: '2026-10-01', ends_on: '2026-10-31' }),
      post('old-limited', { kind: 'limited', ends_on: '2026-09-30' }),
      post('xmas', { kind: 'closure', starts_on: '2026-11-20', ends_on: '2026-11-21' }),
      post('far', { kind: 'closure', starts_on: '2027-01-20' }),
      post('news', { kind: 'news' }),
      post('old-news', { kind: 'news', created_at: '2026-08-01T00:00:00Z' }),
    ],
    now,
  )
  assert.deepEqual(
    c.today.map((p) => p.id),
    ['wings'],
  )
  assert.deepEqual(
    c.weekly.map((p) => p.id),
    ['pasta'],
  )
  assert.deepEqual(
    c.limited.map((p) => p.id),
    ['pumpkin'],
  )
  assert.deepEqual(
    c.closures.map((p) => p.id),
    ['xmas'],
  )
  assert.deepEqual(
    c.news.map((p) => p.id),
    ['news'],
  )
  assert.equal(daysText([4, 2]), 'Tue, Thu')
  assert.equal(closedToday([post('c', { kind: 'closure', starts_on: '2026-10-27' })], now), true)
  assert.equal(
    closedToday(
      [post('h', { kind: 'closure', starts_on: '2026-10-27', body: 'Open 12–4 only' })],
      now,
    ),
    false,
  )
})
