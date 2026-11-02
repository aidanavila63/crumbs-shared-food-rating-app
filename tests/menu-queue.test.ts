import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMonthEnd, leftoverAi } from '../lib/menu-queue.ts'

test('leftover AI allowance and month end', () => {
  const b = (kind: string, monthly: number | null, month: number) => ({
    kind,
    note: null,
    daily_total: null,
    monthly_total: monthly,
    today: 0,
    month,
  })
  assert.equal(
    leftoverAi([
      b('ai', 3000, 2400),
      b('menu_import', 1200, 1300),
      b('explore', null, 50),
      b('google', 900, 10),
    ]),
    600,
  )
  assert.equal(isMonthEnd(new Date(2026, 9, 29)), true)
  assert.equal(isMonthEnd(new Date(2026, 9, 28)), false)
  assert.equal(isMonthEnd(new Date(2026, 1, 26)), true) // Feb has 28 days
})
